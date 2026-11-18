import { describe, expect, it } from 'vitest';
import { parseDiscordLink } from '../src/components/Poker';

describe('discord chat link', () => {
  it('reads server and channel ids from a channel link', () => {
    expect(parseDiscordLink('https://discord.com/channels/299881420891881473/355719584830980096')).toEqual({ server: '299881420891881473', channel: '355719584830980096' });
    expect(parseDiscordLink('https://e.widgetbot.io/channels/299881420891881473/355719584830980096')).toEqual({ server: '299881420891881473', channel: '355719584830980096' });
    expect(parseDiscordLink('https://discord.gg/abc')).toBeNull();
  });
});
