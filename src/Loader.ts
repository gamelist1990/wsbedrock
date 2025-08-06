import { system, } from '@minecraft/server';
import { ver } from './Modules/version';
import { config } from './Modules/config';

const startTime = Date.now();


async function load() {
    try {
        await import('./Modules/CommandAPI/import');
        await import('./command/import');
    } catch (error) {
        console.log(`wsserver Plugin Error ${error}`);
        return
    }
    console.log(`wsserver Plugin Loaded`);
}

load();


async function loadAllImports() {
  try {
    await import('./Modules/import');
  } catch (error) {
    console.warn(`Error importing modules: ${(error as Error).message}`);
  }
}




system.run(() => {
  main();
});

//ワールドの初期化処理

async function main() {
  system.run(async () => {
    try {
      // Load all imports
      await loadAllImports();
    } catch (error) {
      console.warn(`Error loading data: ${(error as Error).message}`);
    }

    const endTime = Date.now();
    const loadTime = endTime - startTime;
    if (config().module.debugMode.enabled === true) {
      console.warn(`Plugin has been loaded in ${loadTime} ms`);
    }


  })
}







if (config().module.debugMode.enabled === true) {
  console.warn(`Full wsserver Addon Data loaded!! Version${ver}`);

}

