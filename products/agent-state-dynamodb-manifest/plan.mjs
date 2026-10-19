import {prepareWith} from './planner.mjs';
import {feature as statusIndex} from './features/status-index.mjs';
import {feature as expiry} from './features/expiry.mjs';
import {feature as recovery} from './features/recovery.mjs';
import {feature as changeStream} from './features/change-stream.mjs';
export const prepare=config=>prepareWith(config,[statusIndex,expiry,recovery,changeStream]);
