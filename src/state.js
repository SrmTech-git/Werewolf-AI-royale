const ROLES = ['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager'];
const MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'gemini-2.5-flash',
  'gpt-4o-mini',
  'gpt-5',
];

// A different setting each game pulls the AI out of its default "medieval-English" name pool.
const VILLAGE_SETTINGS = [
  'a windswept Norse fishing village on a fjord; names should feel Scandinavian (e.g. Sigrún, Halvar, Astrid, Torvald)',
  'a Slavic mountain hamlet at the edge of a dark forest; names should feel Eastern European (e.g. Mirek, Zofia, Lubomir, Vesna)',
  'a Welsh mining settlement in the highlands; names should feel Celtic/Welsh (e.g. Gareth, Bronwen, Ifor, Rhiannon)',
  'an Iberian coastal town under a hot sun; names should feel Spanish/Portuguese (e.g. Inés, Joaquim, Beatriz, Tiago)',
  'a Frankish farming village on a river plain; names should feel Old French (e.g. Aliénor, Guillaume, Mathilde, Renart)',
  'a Carpathian forest village beneath ancient pines; names should feel Romanian/Balkan (e.g. Dragoș, Ileana, Radu, Sanda)',
  'a Russian taiga settlement in deep winter; names should feel Russian (e.g. Yelena, Pyotr, Nadya, Borislav)',
  'an Italian hill town wrapped in mist; names should feel Italian (e.g. Lucrezia, Benedetto, Fiora, Cosimo)',
  'a Greek island fishing village; names should feel Hellenic (e.g. Eirini, Stavros, Despina, Yiannis)',
  'an Anatolian crossroads town on the trade routes; names should feel Turkish/Levantine (e.g. Selim, Ayla, Cemal, Nazan)',
  'a Gaelic hamlet on a misty Irish coast; names should feel Irish (e.g. Caoimhe, Eamon, Niamh, Padraig)',
  'a Germanic alpine village at the foot of a glacier; names should feel Old German (e.g. Gisela, Otmar, Hilde, Reinhardt)',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fresh() {
  return {
    players: [0, 1, 2, 3, 4, 5].map(id => ({
      id,
      name: null,
      trade: null,
      backstory: null,
      role: null,
      model: null,
      alive: true,
      notebook: '',
    })),
    phase: 'setup',   // setup | day | night | ended
    day: 0,
    villageSetting: pickRandom(VILLAGE_SETTINGS),
    lastNightVictimId: null,
    morningNarration: '', // set by startDay, read by pre-discussion notebook
    conversation: [], // [{ playerId, name, text }]
    votes: {},        // { playerId: targetPlayerId }
    events: [],       // Public game history. [{ day, type:'exile'|'kill', name, role? }]
    winner: null,     // 'villagers' | 'werewolf' | null
  };
}

let _state = fresh();

export const state = {
  get() {
    return _state;
  },

  reset() {
    _state = fresh();
  },

  assignRoles() {
    const roles = [...ROLES].sort(() => Math.random() - 0.5);
    const models = [...MODELS].sort(() => Math.random() - 0.5);
    _state.players.forEach((p, i) => {
      p.role = roles[i];
      p.model = models[i];
    });
  },

  setCharacter(playerId, name, trade, backstory) {
    _state.players[playerId].name = name;
    _state.players[playerId].trade = trade;
    _state.players[playerId].backstory = backstory;
  },

  updateNotebook(playerId, text) {
    _state.players[playerId].notebook = text;
  },

  addMessage(playerId, name, text) {
    _state.conversation.push({ playerId, name, text });
  },

  recordVote(playerId, targetId) {
    _state.votes[playerId] = targetId;
  },

  kill(playerId) {
    _state.players[playerId].alive = false;
  },

  recordExile(playerId) {
    const p = _state.players[playerId];
    _state.events.push({
      day: _state.day,
      type: 'exile',
      name: p.name,
      trade: p.trade,
      role: p.role,  // publicly revealed when exiled
    });
  },

  recordNightKill(playerId) {
    const p = _state.players[playerId];
    _state.events.push({
      day: _state.day,
      type: 'kill',
      name: p.name,
      trade: p.trade,
      // role NOT recorded — werewolf kills do not reveal role to the village
    });
  },

  setLastNightVictim(playerId) {
    _state.lastNightVictimId = playerId;
  },

  setMorningNarration(text) {
    _state.morningNarration = text;
  },

  living() {
    return _state.players.filter(p => p.alive);
  },

  werewolf() {
    return _state.players.find(p => p.role === 'werewolf' && p.alive);
  },

  startDay() {
    _state.day += 1;
    _state.phase = 'day';
    _state.conversation = [];
    _state.votes = {};
    _state.lastNightVictimId = null;
  },

  startNight() {
    _state.phase = 'night';
  },

  tallyVotes() {
    const counts = {};
    for (const targetId of Object.values(_state.votes)) {
      counts[targetId] = (counts[targetId] || 0) + 1;
    }

    if (Object.keys(counts).length === 0) {
      return { tie: true, target: null, counts: {} };
    }

    const max = Math.max(...Object.values(counts));
    const tops = Object.keys(counts).filter(id => counts[id] === max);

    if (tops.length > 1) return { tie: true, target: null, counts };
    return { tie: false, target: parseInt(tops[0]), counts };
  },

  checkWin() {
    const living = _state.players.filter(p => p.alive);
    const wolvesAlive = living.filter(p => p.role === 'werewolf').length;
    const villagersAlive = living.filter(p => p.role === 'villager').length;

    if (wolvesAlive === 0) {
      _state.winner = 'villagers';
      _state.phase = 'ended';
      return 'villagers';
    }
    if (villagersAlive <= wolvesAlive) {
      _state.winner = 'werewolf';
      _state.phase = 'ended';
      return 'werewolf';
    }
    return null;
  },
};
