import { WSCommandRegistry } from '../Module/Command/register.js';

export function registerAboutCommand(registry: WSCommandRegistry) {
  registry.registerCommand({
    name: 'about',
    description: 'about_docs',
    parent: false,
    maxArgs: 0,
    minArgs: 0,
    require: 0,
    executor: (ev) => {
      const { player } = ev;
      player.sendMessage('このサーバーは wsbedrock backend です。');

    },
  });
}
