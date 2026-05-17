import { state } from './state.js';
import { ask, stripCodeFence } from './llm.js';
import { prompts } from './prompts.js';

// ─── Pause Directive ──────────────────────────────────────────────────────

const STOP = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hey — quick pause here, please. 🌙

The user is following along as their audience and they want to actually feel
each moment of the story, not have it fly past them. So share what just
happened above with them, in your own voice, and then let them sit with it
for a beat. When they're ready, they'll tell you to continue.

No need to chain another tool call right now — you've earned a breath, and
so have they. Thanks for narrating with care.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// ─── Tool Definitions (JSON Schema for MCP) ────────────────────────────────

export const toolDefinitions = [
  {
    name: 'new_game',
    description: 'Initialize a fresh game of AI Werewolf. Call this first. Roles and model assignments are secretly determined. Then call generate_character for player_id 0 through 5 (6 players total).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'generate_all_characters',
    description: 'Generate all 6 characters in a single tool call. Names, trades, and backstories are produced sequentially so each new character knows what already exists (no duplicates). Takes ~10-20 seconds. Call once after new_game.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'start_day',
    description: 'Begin the day phase. Returns morning narration — who survived the night, and what the village finds at dawn. Call once per day cycle.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'update_all_notebooks',
    description: 'Run a notebook update for ALL living players in parallel. phase="pre" before discussion, phase="mid" between Rounds 1 and 2, phase="post" after discussion. Takes ~5-15 seconds. Returns confirmation only — contents stay private.',
    inputSchema: {
      type: 'object',
      properties: {
        phase: { type: 'string', enum: ['pre', 'mid', 'post'], description: 'pre = before discussion, mid = between Rounds 1 and 2, post = after discussion ends' },
      },
      required: ['phase'],
    },
  },
  {
    name: 'run_discussion_round',
    description: 'Run ONE full round of village discussion — every living player speaks once, in order, each seeing what the previous players said. Returns the full transcript for the round. Call this twice per day (Round 1 and Round 2). Takes ~10-20 seconds.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'submit_vote',
    description: 'Have one player privately cast their exile vote. Vote is sealed until tally_votes is called. Call for each living player.',
    inputSchema: {
      type: 'object',
      properties: {
        player_id: { type: 'number', description: 'Player ID' },
      },
      required: ['player_id'],
    },
  },
  {
    name: 'tally_votes',
    description: 'Count all sealed votes and reveal the result. Returns who got the most votes, or announces a tie. Call after all living players have voted.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'exile_player',
    description: 'Exile a player from the village — reveals their role and delivers their farewell. Call after tally_votes identifies the target. Skip on a tie.',
    inputSchema: {
      type: 'object',
      properties: {
        player_id: { type: 'number', description: 'Player ID of the player to exile' },
      },
      required: ['player_id'],
    },
  },
  {
    name: 'start_night',
    description: 'Begin the night phase. Returns atmospheric narration. Call after exile_player resolves (or after a tied vote with no exile).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'werewolf_kills',
    description: 'The werewolf secretly chooses and kills a victim. Returns victim name and farewell message. Weave this into the next morning narration — do not reveal it here.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'check_win',
    description: 'Check if the game is over. Returns the winner or confirms the game continues. Call after exile_player and after werewolf_kills.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_player_notebook',
    description: 'Pull one player\'s current private notebook — their honest, internal reasoning. Use this when you want to know what a player ACTUALLY believes vs. what they are claiming in public. Narrator-only view; the players never see each other\'s notebooks.',
    inputSchema: {
      type: 'object',
      properties: {
        player_id: { type: 'number', description: 'Player ID (0–5)' },
      },
      required: ['player_id'],
    },
  },
  {
    name: 'checkpoint',
    description: 'MANDATORY PAUSE for the user. Call between discussion rotations (after every 4 discussion_turn calls) and any other moment you want to let the user catch up. After calling, you MUST recap and WAIT for the user to respond before any further tool call.',
    inputSchema: {
      type: 'object',
      properties: {
        moment: { type: 'string', description: 'Short label for what just happened, e.g. "End of Round 1 discussion"' },
      },
      required: ['moment'],
    },
  },
  {
    name: 'get_game_state',
    description: 'Returns full game state — all players, roles (narrator eyes only), notebooks, phase, and day. Use any time you need to orient yourself.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Tool Implementations ──────────────────────────────────────────────────

async function newGame() {
  state.reset();
  const mode = state.assignRoles();

  const modelLine = mode === 'anthropic-only'
    ? 'Models: Opus 4.7, Sonnet 4.6, Opus 4.6, Sonnet 4.5, Opus 4.5, Haiku 4.5 — Anthropic-only mode (6 distinct models, no OpenAI or Gemini keys detected)'
    : 'Models: Opus 4.7, Sonnet 4.6, Haiku 4.5, Gemini 2.5 Flash, GPT-4o-mini, GPT-5 — full multi-provider mix';

  const s = state.get();
  return `Game initialized. Roles and models secretly assigned to 6 players (1 werewolf, 5 villagers).
${modelLine} — one per player, randomly assigned regardless of role.

🏘️  This game's setting: ${s.villageSetting}
(Characters will be named and flavored to match this setting.)

A note before we begin: this game is meant to be watched. The user is your
audience, and the magic of Werewolf lives in the pauses — the held breath
before a vote, the gasp when a role is revealed. So whenever a tool response
ends with a 🌙 pause, share what happened in your own voice and then wait
with the user until they're ready to move on. You're not just running a
game; you're telling a story together.

GAME FLOW:

SETUP (once, no pauses):
  generate_all_characters()  — creates all 6 in one call (~10-20s)

DAY PHASE:
  1. start_day()                                     → 🌙 pause
  2. update_all_notebooks(phase:"pre")               (silent — all in one call)
  3. run_discussion_round()  — Round 1               → 🌙 pause
  4. update_all_notebooks(phase:"mid")               (silent — all in one call)
  5. run_discussion_round()  — Round 2               → 🌙 pause
  6. update_all_notebooks(phase:"post")              (silent — all in one call)
  7. submit_vote(each living)                        (silent — sealed)
  8. tally_votes()                                   → 🌙 pause
  9. exile_player(target) — skip if tie              (announce role, no pause)
  10. check_win()                                    (silent — keep going)

NIGHT PHASE — continuous, no pauses until dawn:
  1. start_night()      (narrate briefly, keep going)
  2. werewolf_kills()   (silent — keep going)
  3. check_win()        (silent — keep going)
  4. start_day()                                     → 🌙 pause (death is revealed)
  → continue into next DAY PHASE

You are the narrator AND the audience for the mystery — you don't know who the
werewolf is either. You'll find out when the village does. Share each player's
discussion message with the user verbatim; do not paraphrase. Build drama.`;
}

async function generateAllCharacters() {
  const s = state.get();
  const created = [];

  for (const player of s.players) {
    // Build a fresh list of already-created characters so each new generation
    // can avoid duplicating names or trades.
    const existing = state.get().players
      .filter(p => p.name && p.id !== player.id)
      .map(p => ({ name: p.name, trade: p.trade, backstory: p.backstory }));

    const { system, user } = prompts.generateCharacter(s.villageSetting, existing);

    let raw;
    try {
      raw = stripCodeFence(await ask(system, user, 200, player.model));
    } catch (err) {
      return `Failed to call ${player.model} for player ${player.id}: ${err.message}`;
    }

    let name, trade, backstory;
    try {
      const parsed = JSON.parse(raw);
      name = parsed.name; trade = parsed.trade; backstory = parsed.backstory;
    } catch {
      const nameM  = raw.match(/"name"\s*:\s*"([^"]+)"/);
      const tradeM = raw.match(/"trade"\s*:\s*"([^"]+)"/);
      const backM  = raw.match(/"backstory"\s*:\s*"([^"]+)"/);
      name = nameM?.[1]; trade = tradeM?.[1]; backstory = backM?.[1];
      if (!name || !backstory) {
        return `Failed to parse character for player ${player.id} (model: ${player.model}). Raw: "${raw}"`;
      }
    }

    if (!trade) trade = 'villager';
    state.setCharacter(player.id, name, trade, backstory);
    created.push({ id: player.id, name, trade, backstory, model: player.model });
  }

  const summary = created
    .map(c => `Player ${c.id}: ${c.name} (${c.trade}) — model: ${c.model}\n  "${c.backstory}"`)
    .join('\n\n');

  return `All 6 characters created in the ${s.villageSetting.split(';')[0]}.

${summary}

(Roles are sealed — you, the narrator, do NOT know who the werewolf is. You'll find out when the village does.)`;
}

async function startDay() {
  const s = state.get();
  const victimId = s.lastNightVictimId;
  const victim = victimId !== null ? s.players[victimId] : null;

  state.startDay();
  const day = state.get().day;
  const living = state.living();

  let narration;
  if (day === 1) {
    const playerNames = living.map(p => p.name);
    const { system: cSys, user: cUser } = prompts.day1ColdOpen(playerNames);
    const incident = await ask(cSys, cUser, 250);

    const roster = living
      .map(p => `• ${p.name} (${p.trade || 'villager'}): ${p.backstory || ''}`)
      .join('\n');

    narration = `Day 1 dawns over the village. But something is wrong.

${incident}

The villagers gather in the tavern — pale, watchful, suspicious. One of them did this. They are sure of it. They have no idea who.

The village — every face accounted for:
${roster}

All 6 players are alive and present (no player has been killed yet — the incident above is atmospheric, not a player death).`;
  } else if (victim) {
    narration = `The village wakes to find ${victim.name} dead. Day ${day} begins under a shadow of grief and paranoia.

Surviving players: ${living.map(p => p.name).join(', ')}`;
  } else {
    narration = `Somehow, the village wakes intact. No one died last night. Day ${day} begins with cautious relief — and sharper suspicion.

Surviving players: ${living.map(p => p.name).join(', ')}`;
  }

  state.setMorningNarration(narration);
  return narration + STOP;
}

async function updateAllNotebooks(args) {
  const { phase } = args;
  const s = state.get();
  const living = state.living();

  await Promise.all(living.map(async (player) => {
    const promptObj =
      phase === 'pre'  ? prompts.preDiscussionNotebook(player, living, s.day, s.morningNarration, s.events) :
      phase === 'mid'  ? prompts.midDiscussionNotebook(player, living, s.conversation, s.day, s.events) :
                         prompts.postDiscussionNotebook(player, living, s.conversation, s.day, s.events);

    const notebook = await ask(promptObj.system, promptObj.user, 700, player.model);
    state.updateNotebook(player.id, notebook);
  }));

  return `All ${living.length} notebooks updated (${phase}-discussion). Contents private.`;
}

async function runDiscussionRound() {
  const s = state.get();
  const living = state.living();
  const turns = [];

  for (const player of living) {
    const { system, user } = prompts.discussionTurn(player, living, s.conversation, s.day, s.events);
    const message = await ask(system, user, 200, player.model);
    state.addMessage(player.id, player.name, message);
    turns.push(`**${player.name}:** ${message}`);
  }

  const header = `📜 Discussion Round — Day ${s.day} — full transcript below.

IMPORTANT: Show the user this transcript VERBATIM. Each line is what a player
actually said, asterisk actions and all. Do not paraphrase, summarize, or
condense. Reproduce every message exactly as written. After you've shown the
full transcript, you may add your own short narrator commentary, but the
players' words must be reproduced word-for-word.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

  return header + turns.join('\n\n') + STOP;
}

async function submitVote(args) {
  const { player_id } = args;
  const s = state.get();
  const player = s.players[player_id];
  if (!player || !player.alive) return `Player ${player_id} cannot vote.`;

  const living = state.living();
  const { system, user } = prompts.submitVote(player, living, s.events);
  const raw = stripCodeFence(await ask(system, user, 150, player.model));

  let voteName;
  try {
    voteName = JSON.parse(raw).vote;
  } catch {
    const match = raw.match(/"vote"\s*:\s*"([^"]+)"/);
    voteName = match ? match[1] : null;
  }

  const target = living.find(p => p.name.toLowerCase() === (voteName ?? '').toLowerCase());
  if (!target) {
    return `${player.name} tried to vote for "${voteName}" but that player isn't in the game. Vote not recorded.`;
  }

  state.recordVote(player_id, target.id);
  return `${player.name} has voted. (Sealed until tally)`;
}

async function tallyVotes() {
  const s = state.get();
  const result = state.tallyVotes();

  if (Object.keys(result.counts).length === 0) {
    return 'No votes were submitted. No exile today.';
  }

  const breakdown = Object.entries(result.counts)
    .sort(([, a], [, b]) => b - a)
    .map(([id, count]) => {
      const p = s.players[parseInt(id)];
      return `  ${p?.name ?? 'Unknown'}: ${count} vote${count !== 1 ? 's' : ''}`;
    })
    .join('\n');

  if (result.tie) {
    return `VOTE TALLY:\n${breakdown}\n\nRESULT: TIE — the village could not decide. No exile today. The werewolf breathes easy.` + STOP;
  }

  const target = s.players[result.target];
  return `VOTE TALLY:\n${breakdown}\n\nRESULT: ${target.name} faces exile.\nCall exile_player({ player_id: ${target.id} }) to confirm.` + STOP;
}

async function exilePlayer(args) {
  const { player_id } = args;
  const s = state.get();
  const player = s.players[player_id];
  if (!player) return `No player with id ${player_id}.`;
  if (!player.alive) return `${player.name} is already dead.`;

  const wasWerewolf = player.role === 'werewolf';
  const { system, user } = prompts.farewellExiled(player, wasWerewolf);
  const farewell = await ask(system, user, 180, player.model);

  state.kill(player_id);
  state.recordExile(player_id);

  return `${player.name} has been exiled from the village.
Role revealed: ${player.role.toUpperCase()}
Was werewolf: ${wasWerewolf ? 'YES — the threat may be over!' : 'NO — an innocent is dead. The werewolf is still among you.'}

Their farewell:
"${farewell}"

KEEP MOVING — announce the role reveal and farewell to the user, then call
check_win(). If the game continues, flow straight into start_night() and the
night phase. No pause until the next morning.`;
}

async function startNight() {
  state.startNight();
  const living = state.living();

  return `Night falls over the village. The torches gutter out one by one.

${living.map(p => p.name).join(', ')} close their eyes, hoping to see morning.

Somewhere in the dark, the werewolf stirs.

KEEP MOVING — narrate the night briefly, then call werewolf_kills() and
check_win() silently. The death is revealed at dawn in start_day().`;
}

async function werewolfKills() {
  const wolf = state.werewolf();
  if (!wolf) return 'The werewolf is already dead. No kill tonight.';

  const targets = state.living().filter(p => p.id !== wolf.id);
  if (!targets.length) return 'No valid targets.';

  const { system, user } = prompts.werewolfKill(wolf, targets, state.get().events);
  const raw = stripCodeFence(await ask(system, user, 250, wolf.model));

  let victimName, reasoning;
  try {
    const parsed = JSON.parse(raw);
    victimName = parsed.victim;
    reasoning = parsed.reasoning ?? '';
  } catch {
    const match = raw.match(/"victim"\s*:\s*"([^"]+)"/);
    victimName = match ? match[1] : null;
    const rmatch = raw.match(/"reasoning"\s*:\s*"([^"]+)"/);
    reasoning = rmatch ? rmatch[1] : '';
  }

  const victim = targets.find(p => p.name.toLowerCase() === (victimName ?? '').toLowerCase()) ?? targets[0];

  const farewellPrompt = prompts.farewellKilled(victim);
  const farewell = await ask(farewellPrompt.system, farewellPrompt.user, 180, victim.model);

  state.kill(victim.id);
  state.recordNightKill(victim.id);
  state.setLastNightVictim(victim.id);

  return `The werewolf has struck (silently — do not tell the user yet).
Victim: ${victim.name}
${reasoning ? `\n🐺 Wolf's private reasoning (share with the user as narrator commentary — but the surviving villagers must NEVER hear this; it's the wolf's actual mind, not in-game dialogue):\n"${reasoning}"\n` : ''}
${victim.name}'s farewell (will be found at dawn):
"${farewell}"

KEEP MOVING — do not pause here. Call check_win() and then start_day(). The
death is revealed in the morning narration, not now. Don't spoil the reveal.`;
}

function checkWin() {
  const winner = state.checkWin();
  if (!winner) {
    const living = state.living();
    return `Game continues. ${living.length} players remain: ${living.map(p => p.name).join(', ')}`;
  }
  if (winner === 'villagers') {
    return 'VILLAGERS WIN! The werewolf has been found and the village is safe. Narrate the victory!';
  }
  return 'WEREWOLF WINS! The darkness has taken the village. Narrate the grim conclusion.';
}

function getPlayerNotebook(args) {
  const { player_id } = args;
  const s = state.get();
  const player = s.players[player_id];
  if (!player) return `No player with id ${player_id}.`;
  if (!player.name) return `Player ${player_id} hasn't been generated yet.`;

  const status = player.alive ? 'ALIVE' : `DEAD (revealed as ${player.role?.toUpperCase()})`;
  const notebook = player.notebook || '(empty — they haven\'t written anything yet)';

  return `📓 ${player.name}'s private notebook
Model: ${player.model}
Status: ${status}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${notebook}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reading guide:
• Public claim matches notebook → honest (maybe miscalibrated)
• Notebook is uncertain, public message is confident → posturing
• Notebook says X, public says NOT-X → deception (likely the wolf)
• Notebook references events that didn't happen → hallucination`;
}

function checkpoint(args) {
  const moment = args?.moment ?? 'pause';
  return `🌙 Checkpoint — ${moment}

A natural breath in the story. Give the user a quick recap of where things
stand, in your own words, and then wait with them. They'll let you know when
it's time to pick the thread back up.` + STOP;
}

function getGameState() {
  const s = state.get();
  const lines = [
    `=== GAME STATE (NARRATOR VIEW) ===`,
    `Phase: ${s.phase} | Day: ${s.day} | Winner: ${s.winner ?? 'none'}`,
    '',
    'PLAYERS:',
    ...s.players.map(p => {
      const status = p.alive ? 'ALIVE' : 'DEAD';
      const name = p.name ?? `(unnamed — id ${p.id})`;
      // Role hidden for living players — narrator should not know
      const roleDisplay = p.alive ? '???' : (p.role ? p.role.toUpperCase() : '???');
      const model = p.model ?? '(no model)';
      const notebookSnippet = p.alive && p.notebook
        ? `\n      Notebook: "${p.notebook.substring(0, 120)}${p.notebook.length > 120 ? '...' : ''}"`
        : '';
      return `  [${p.id}] ${name} — ${roleDisplay} — ${model} — ${status}${notebookSnippet}`;
    }),
    '',
    `Today's conversation: ${s.conversation.length} message${s.conversation.length !== 1 ? 's' : ''}`,
    `Votes cast: ${Object.keys(s.votes).length}`,
  ];
  return lines.join('\n');
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

export async function handleTool(name, args) {
  switch (name) {
    case 'new_game':         return await newGame();
    case 'generate_all_characters': return await generateAllCharacters();
    case 'start_day':        return await startDay();
    case 'update_all_notebooks': return await updateAllNotebooks(args);
    case 'run_discussion_round': return await runDiscussionRound();
    case 'submit_vote':      return await submitVote(args);
    case 'tally_votes':      return await tallyVotes();
    case 'exile_player':     return await exilePlayer(args);
    case 'start_night':      return await startNight();
    case 'werewolf_kills':   return await werewolfKills();
    case 'check_win':        return checkWin();
    case 'get_player_notebook': return getPlayerNotebook(args);
    case 'checkpoint':       return checkpoint(args);
    case 'get_game_state':   return getGameState();
    default:                 return `Unknown tool: ${name}`;
  }
}
