/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import Task from '@grr/async/task';
import Inventory from '@grr/inventory';
import Metrics from '@grr/metrics';
import Rollcall from '@grr/rollcall';

const { Executor } = Task;

export default async function createContext(configure) {
  // Start measuring tool latency before doing anything else.
  const metrics = new Metrics();
  const stopMainTimer = metrics.timer('main').start();

  let context;
  try {
    // Retrieve the configuration: `site`, `forge`, `options`.
    context = await configure();
    assert(context.forge && typeof context.forge === 'object');
    assert(context.options && typeof context.options === 'object');

    // Add remaining services: `executor`, `inventory`, `logger`, `metrics`.
    // Inventory object still is empty, since we haven't read the file system.
    context.executor = new Executor();
    context.inventory = new Inventory({
      isStaticAsset: context.options.staticAssets,
      justCopy: context.options.justCopy,
    });

    context.logger = new Rollcall({
      json: context.options.json,
      label: context.forge.name,
      volume: context.options.volume,
    });
    context.metrics = metrics;
    context.stopMainTimer = stopMainTimer;
  } catch (x) {
    // Fallback context has just the properties for printing help and exiting.
    context = { options: { help: true }, logger: new Rollcall() };
    context.logger.error(x.message);
    context.logger.println();
  }

  return context;
}
