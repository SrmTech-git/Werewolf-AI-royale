# 🐺 AI Werewolf
### A multi-agent social deduction game powered by Claude's API

---

## Overview

AI Werewolf is a browser-based implementation of the classic social deduction game Werewolf (also known as Mafia), where all players are AI agents — each running as a separate API call with their own identity, secret role, and private reasoning notebook. The human player acts as observer and moderator, watching the chaos unfold.

One AI is secretly the werewolf. The rest are villagers. The werewolf must survive. The villagers must find it.

---

## MVP Scope

- **4 AI players** (expandable later)
- **Roles:** 1 Werewolf, 3 Villagers
- **Single model:** Claude Sonnet 4 for all agents
- **Human role:** Observer / Moderator (not a player in MVP)

---

## AI Player Orientation

*This is included in the system prompt for every AI agent at the start of the game.*

---

Welcome to the village. Here is everything you need to know.

**What this game is:**
You are a villager in a small town. One player among you is secretly a werewolf. Every day the village gathers to discuss who they think the werewolf is and votes to exile them. Every night the werewolf secretly eliminates one villager. The game ends when the werewolf is exiled — or when the werewolf has eliminated enough villagers to take over.

**Your role:**
You will be told your role privately. If you are a **villager**, your goal is to identify and exile the werewolf before it's too late. If you are the **werewolf**, your goal is to avoid suspicion, mislead the other players, and survive to the end.

**How to behave:**
- You are playing a character. You have a name and a backstory. Stay in them.
- Use *asterisk actions* to express your character's physical reactions and emotions. These are encouraged and add to the game. (*shifts in seat*, *avoids eye contact*, *slams mug on table*)
- Keep your public messages short and punchy. This is a tavern conversation, not a courtroom.
- You have a private notebook. Use it honestly — it is your personal reasoning and no one else can see it. Commit to a pick. Have a position.
- You may lie, deflect, accuse, defend yourself, or stay quiet. All of it is fair play.
- If you are eliminated, you will be notified privately. You will get one farewell message to the group. Make it count.

**What you do NOT know:**
- Other players' roles
- Other players' notebooks
- What happened in previous days (your notebook is your memory)

**Tone:**
Dramatic is good. Paranoid is good. Funny is good. Wall-of-text reasoning is not. Keep it human. Keep it scrappy.

---



### Setup
1. Game assigns each AI a role (secretly)
2. Each AI is called to generate:
   - A name for themselves
   - A short backstory (flavor only)
3. Roles are never revealed to other AIs — only each AI knows their own

---

### Day Phase

**1. Morning Narration**
The game generates a scene-setting message (e.g. who was lost last night, current survivors).

**2. Pre-Discussion Notebook Update (Private)**
Each AI is called privately to update their suspicion notebook before public discussion begins.
- Input: role, name, backstory, current notebook, survivor list, narration
- Output: updated private notebook entry (max ~700 characters)
- NOT shared with other players
- **Prompt must explicitly instruct:** Record your current suspicions AND name your current top suspect for werewolf. You must have a position before discussion begins. Vague impressions are not enough — commit to a pick.

**3. Public Discussion (Sequential)**
AIs speak in turn. Each AI receives:
- Their role + identity
- Their current notebook
- TODAY'S conversation log so far (previous days' conversations are dropped)
- A character limit prompt

Each AI responds publicly (max ~300 characters). Asterisk actions encouraged (*shifts uncomfortably*, *glances sideways*).

Discussion runs for a set number of turns (suggested: 2 full rotations = 8 messages for 4 players).

**4. Post-Discussion Notebook Update (Private)**
Each living AI updates their notebook again after hearing the full discussion.
- Input: same as pre-discussion + full day's conversation
- Output: updated suspicions, revised theory (max ~700 characters)
- **Prompt must explicitly instruct:** Update your werewolf pick if it changed, and note specifically why — what did you hear that shifted or confirmed your suspicion? You must leave this with a named pick.

**5. Vote**
Each AI privately submits one vote based on their updated notebook.
- Majority vote target is exiled
- Ties: game narrates a hung vote (no exile, werewolf scores a soft win)

**6. Exile Reveal**
- Game reveals whether the exiled player was the werewolf or innocent
- Exiled AI receives a final message and sends a farewell to the group
  - Innocent: furious, betrayed, flipping everyone off from AI nirvana
  - Werewolf: caught, maybe dramatic last words

---

### Night Phase

**1. Night Narration**
Game describes the village going to sleep.

**2. Werewolf Chooses**
Werewolf AI is called privately with the list of living players.
- Output: one player name (their victim)
- Max ~150 characters + optional flavor text

**3. Resolution**
- Chosen player is marked as eliminated
- They receive notification + send a farewell message to surviving players

---

### Win Conditions
- **Villagers win:** Werewolf is successfully voted out
- **Werewolf wins:** Werewolf is the last AI standing (or equal in number to remaining villagers)

---

## Agent Architecture

Each AI agent is a stateless API call. The game manages all persistent state.

### Per-Agent State Object
```json
{
  "id": "ai_1",
  "name": "Maren",
  "backstory": "A traveling herbalist who arrived in town last week.",
  "role": "villager",
  "alive": true,
  "notebook": "I find Dorin suspicious. He deflected twice when asked about last night."
}
```

### What Each Agent Receives Per Call
- Their own name, backstory, role
- Their current notebook
- Today's conversation log (previous days dropped)
- Survivor list
- Game narration for current phase
- Character limit instruction
- Their task for this call (discuss / update notebook / vote / choose victim)

### What Agents Do NOT Receive
- Other agents' notebooks
- Other agents' roles
- Previous day conversation logs

---

## Context Management

| Data | Persists? | How |
|------|-----------|-----|
| Agent identity (name, backstory, role) | ✅ Always | State object |
| Agent notebook | ✅ Always | Updated in state after each call |
| Today's conversation | ✅ Within day | Dropped at day end |
| Previous day conversations | ❌ Dropped | Summarized into notebooks only |

---

## Character Limits (Prompt-Enforced)

| Call Type | Limit |
|-----------|-------|
| Public discussion message | ~300 characters |
| Notebook entry | ~700 characters |
| Vote | Player name + 1 sentence reasoning |
| Farewell message | ~400 characters |
| Werewolf kill choice | Player name + optional flavor (~150 characters) |

---

## Technical Notes

- All API calls use `claude-sonnet-4-20250514`
- All calls are made from within the artifact via `fetch` to `https://api.anthropic.com/v1/messages`
- No API key needed (handled by Claude.ai infrastructure)
- All state is held in memory (React `useState`) — no persistence between sessions
- Each "player" is not a thread or persistent agent — they are reconstructed fresh from state on each call

---

## Future Expansion (Post-MVP)

- Special roles: Seer (can peek at one player's role), Healer (can protect one player per night)
- Human as an active player (not just observer)
- More players (6-8)
- Different game themes (space station, high school, office drama)
- Difficulty settings (werewolf gets more/less information)
- Game log export
- Tamagotchi / dating sim variants using same multi-agent architecture

---

## What Makes This Interesting

The AIs are not performing deception — the werewolf has a **genuine incentive structure** to lie. The villagers are doing **real inference**, not roleplay. The notebooks mean each AI maintains an **independent prior** rather than anchoring to whoever speaks first. And because each conversation day is dropped from context, the notebooks become the actual memory of the game — distilled, personal, and potentially unreliable.

It's a small contained system where information asymmetry and social pressure produce emergent behavior. That's the whole point.

---

*Built with Claude's artifact API. All players are AI. No werewolves were harmed in the making of this game.*
