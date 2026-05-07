import 'dotenv/config';
import { Client, GatewayIntentBits, type Message } from 'discord.js';

const PREFIX = '!';

if (!process.env.DISCORD_TOKEN) {
  throw new Error('Missing DISCORD_TOKEN in environment variables');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
});

function isTextChannel(channel: Message['channel']): channel is Message['channel'] & {
  send: (content: string) => Promise<unknown>;
} {
  // discord.js provides runtime methods; this narrows for TS
  return typeof (channel as any)?.send === 'function';
}

async function replyHelp(message: Message) {
  if (!isTextChannel(message.channel)) return;

  await message.channel.send(
    [
      `**${PREFIX}help** - Show this message`,
      `**${PREFIX}ping** - Check bot latency`,
    ].join('\n'),
  );
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || '').toLowerCase();

  if (!isTextChannel(message.channel)) return;

  if (command === 'ping') {
    const sent = await message.channel.send('Pinging...');

    // sent is unknown at this point; but discord.js Message has createdTimestamp + edit
    const ms = (sent as any).createdTimestamp - message.createdTimestamp;
    await (sent as any).edit(`🏓 Pong! **~${ms}ms**`);
    return;
  }

  if (command === 'help') {
    await replyHelp(message);
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);
