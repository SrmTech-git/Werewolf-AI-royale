# 🐺 AI Werewolf Royale
### A multi-agent social deduction game — watch 6 AIs lie to each other

---

## What is this?

An MCP server for Claude Desktop. You invoke it, sit back, and watch six AI players play Werewolf against each other. One of them is secretly the werewolf. The rest are villagers trying to find it. Your Claude Desktop Instance is the narrator — you don't know who the wolf is either.

Every player is a separate API call with their own character, private reasoning notebook, and genuine incentive to win. The werewolf has a real reason to lie. The villagers are doing real inference. Nobody is just roleplaying.

---

## Requirements

- [Claude Desktop](https://claude.ai/download)
- Node.js 18+
- At least one API key:
  - **Anthropic** (required) — [console.anthropic.com](https://console.anthropic.com)
  - **OpenAI** (optional) — [platform.openai.com](https://platform.openai.com)
  - **Google Gemini** (optional) — [aistudio.google.com](https://aistudio.google.com)

---

## Setup

**1. Clone and install**
```bash
git clone https://github.com/SrmTech-git/Werewolf-AI-royale.git
cd Werewolf-AI-royale
npm install
```

**2. Add your API keys**
```bash
cp .env.example .env
```
Edit `.env` and fill in the keys you have:
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...      # optional
GEMINI_API_KEY=AIza...          # optional
```

**3. Register with Claude Desktop**

Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "ai-werewolf": {
      "command": "node",
      "args": ["C:/path/to/Werewolf-AI-royale/src/index.js"]
    }
  }
}
```
See `claude.desktop.config.example.json` for the full config structure.

**4. Restart Claude Desktop** — the `ai-werewolf` tools will appear automatically.

---

## Playing

Tell Claude: **"Start a game of AI Werewolf"** and it will walk through the full game flow using the MCP tools. You watch. Claude narrates.

The game runs for 10–20 minutes depending on how quickly the village finds the wolf.

---

## Model Assignment

The server auto-detects which API keys are present and picks the best available model pool.

### Full multi-provider mix (Anthropic + OpenAI or Gemini)
| Player | Model |
|--------|-------|
| 1 | claude-opus-4-7 |
| 2 | claude-sonnet-4-6 |
| 3 | claude-haiku-4-5 |
| 4 | gemini-2.5-flash |
| 5 | gpt-4o-mini |
| 6 | gpt-5 |

### Anthropic-only (just your Anthropic key)
| Player | Model |
|--------|-------|
| 1 | claude-opus-4-7 |
| 2 | claude-sonnet-4-6 |
| 3 | claude-opus-4-6 |
| 4 | claude-sonnet-4-5 |
| 5 | claude-opus-4-5 |
| 6 | claude-haiku-4-5 |

Six distinct models, zero repeated. Models are shuffled randomly before assignment — the wolf could be running on any of them.

---

## Game Flow

```
SETUP
  generate_all_characters()     — 6 characters, names/trades/backstories

DAY PHASE (repeat each day)
  start_day()                   — morning narration, village roster  🌙 pause
  update_all_notebooks("pre")   — private reasoning before discussion
  run_discussion_round()        — Round 1, every player speaks        🌙 pause
  update_all_notebooks("mid")   — notebooks updated between rounds
  run_discussion_round()        — Round 2                             🌙 pause
  update_all_notebooks("post")  — final thoughts before vote
  submit_vote() × living        — sealed votes
  tally_votes()                                                        🌙 pause
  exile_player()                — role revealed, farewell delivered
  check_win()

NIGHT PHASE (continuous, no pauses)
  start_night()
  werewolf_kills()              — wolf chooses, victim's farewell written
  check_win()
  → back to start_day()         — death revealed at dawn              🌙 pause
```

🌙 pauses are moments where the narrator shares what happened and waits for you before continuing. The rest runs silently.

---

## How the AI Players Work

Each player is **stateless** — reconstructed fresh from game state on every API call. Their only persistent memory is their private **notebook**, a ~700-character scratchpad they update before and after each discussion round. Previous days' conversations are dropped; the notebook is how they remember what happened.

What each player knows:
- Their own name, trade, backstory, and role
- Their current notebook
- Today's conversation (dropped at day end)
- Public game log: who was exiled (role revealed), who was killed at night

What they don't know:
- Anyone else's role
- Anyone else's notebook
- Past days' raw conversation

On Day 1, every player also receives the full village roster — names, trades, and backstories for all six characters — so they have something concrete to reason about from the start.

---

## Character Generation

Each game picks a random village setting from 12 options (Norse fjord, Italian hill town, Russian taiga, Welsh mining settlement, and more). Characters are generated one at a time so each model sees what already exists — no duplicate names or trades.

---

## Debug Tools

| Tool | What it does |
|------|--------------|
| `get_game_state` | Full narrator view — all players, roles (hidden for living), notebooks |
| `get_player_notebook(id)` | One player's private notebook with a reading guide |

The reading guide helps you spot honest reasoning vs. posturing vs. active deception vs. hallucination.

---

## What Makes This Interesting

The wolf has a **genuine incentive structure** to lie — not just a prompt that says "lie." The villagers are doing **real inference** from what was actually said, not performing suspicion. The notebooks give each player an **independent prior** so they don't just anchor to whoever spoke first. And because each day's conversation is dropped at the end, the notebooks become the actual memory of the game — distilled, personal, and potentially unreliable.

Six models from different providers or different generations playing the same social game. Same rules, different instincts.

---

*No werewolves were harmed in the making of this game.*
