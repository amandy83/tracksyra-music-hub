import { loadRuntimeEnv } from "../config/envLoader";

loadRuntimeEnv();

export { startAllWorkers, startEmailWorker, startWorkers } from "./bootstrap/startWorkers";
