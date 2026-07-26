import streamDeck from "@elgato/streamdeck";

import { SessionStatusAction } from "./actions/session-status";
import { AgentSessionAction } from "./actions/agent-session";

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new SessionStatusAction());
streamDeck.actions.registerAction(new AgentSessionAction());

streamDeck.connect();
