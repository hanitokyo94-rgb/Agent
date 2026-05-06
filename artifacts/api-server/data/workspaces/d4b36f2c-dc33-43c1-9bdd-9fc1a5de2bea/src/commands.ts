// Slash command definitions registered with Discord

export const COMMANDS = [
  {
    name: 'ping',
    description: 'Replies with Pong! and bot latency info',
    type: 1,
  },
  {
    name: 'hello',
    description: 'Greet a user',
    type: 1,
    options: [
      {
        name: 'user',
        description: 'The user to greet',
        type: 6, // USER
        required: false,
      },
    ],
  },
  {
    name: 'roll',
    description: 'Roll a dice (e.g. d20, d6)',
    type: 1,
    options: [
      {
        name: 'sides',
        description: 'Number of sides on the dice (default 6)',
        type: 4, // INTEGER
        required: false,
        min_value: 2,
        max_value: 1000,
      },
      {
        name: 'count',
        description: 'How many dice to roll (default 1)',
        type: 4,
        required: false,
        min_value: 1,
        max_value: 20,
      },
    ],
  },
  {
    name: '8ball',
    description: 'Ask the magic 8-ball a question',
    type: 1,
    options: [
      {
        name: 'question',
        description: 'Your yes-or-no question',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'avatar',
    description: 'Show a user\'s avatar',
    type: 1,
    options: [
      {
        name: 'user',
        description: 'The user (defaults to you)',
        type: 6,
        required: false,
      },
    ],
  },
  {
    name: 'coinflip',
    description: 'Flip a coin',
    type: 1,
  },
  {
    name: 'choose',
    description: 'Pick randomly from comma-separated options',
    type: 1,
    options: [
      {
        name: 'options',
        description: 'Comma-separated choices, e.g. "pizza, sushi, tacos"',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: 'serverinfo',
    description: 'Show information about this server',
    type: 1,
  },
  {
    name: 'help',
    description: 'List all available commands',
    type: 1,
  },
];
