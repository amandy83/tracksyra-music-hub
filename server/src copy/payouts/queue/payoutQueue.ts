import { Queue, QueueScheduler } from "bullmq";

import { config } from "../../config";

export const connections = {
  redis: {
    host: (config.redisUrl || "redis://127.0.0.1:6379").replace(/^redis:\/\//, "").split(":")[0],
    port: Number((config.redisUrl || "redis://127.0.0.1:6379").split(":").pop() || 6379),
  },
};

export const payoutQueue = new Queue("payout-queue", connections);

export const payoutQueueSchedulers = [new QueueScheduler("payout-queue", connections)];

