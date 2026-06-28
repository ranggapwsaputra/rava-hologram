/**
 * @deprecated ravaVoice.ts — Superseded by voiceBridge.ts.
 *
 * This file is kept only as a compatibility shim. All imports from this module
 * will automatically route through voiceBridge.ts which uses ElevenLabs via
 * the Python jarvis.py agent, with a browser TTS fallback when offline.
 *
 * Please update your imports to:
 *   import { speak, cancel } from "./voiceBridge";
 */

export { speak, cancel } from "./voiceBridge";
