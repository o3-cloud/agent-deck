import streamDeck from "@elgato/streamdeck";

import { SessionStatusAction } from "./actions/session-status";
import { AgentSessionAction } from "./actions/agent-session";
import { AttentionQueueAction } from "./actions/attention-queue";

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new SessionStatusAction());
streamDeck.actions.registerAction(new AgentSessionAction());
streamDeck.actions.registerAction(new AttentionQueueAction());

streamDeck.connect();
