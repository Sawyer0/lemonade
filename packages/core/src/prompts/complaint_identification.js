"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPLAINT_IDENTIFICATION_PROMPT = void 0;
exports.COMPLAINT_IDENTIFICATION_PROMPT = `The user has started a diagnostic session. Identify the core vehicle complaint from the following message, responding with ONLY the complaint text. If no clear complaint is present, respond with 'N/A'.
Message: '{message}'`;
