import { loadRuntimeEnv } from "../config/envLoader";

loadRuntimeEnv();

export { processEmailJob, registerEmailWorker } from "./email/emailWorker";
