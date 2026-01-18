import { isSupported, perform, HapticFeedbackPattern, PerformanceTime } from "tauri-plugin-macos-haptics-api";

let hapticSupported: boolean | null = null;

async function checkSupport() {
    if (hapticSupported === null) {
        try {
            hapticSupported = await isSupported();
        } catch {
            hapticSupported = false;
        }
    }
    return hapticSupported;
}

export async function hapticFeedback(pattern: "generic" | "alignment" | "levelChange" = "generic") {
    const supported = await checkSupport();
    if (!supported) return;

    try {
        const patternMap = {
            generic: HapticFeedbackPattern.Generic,
            alignment: HapticFeedbackPattern.Alignment,
            levelChange: HapticFeedbackPattern.LevelChange,
        };
        await perform(patternMap[pattern], PerformanceTime.Now);
    } catch {
    }
}

export function haptic(pattern: "generic" | "alignment" | "levelChange" = "generic") {
    hapticFeedback(pattern);
}
