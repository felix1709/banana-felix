import { CUSTOM_OPTION, ensureCustomOption, isCustomOption, isManualInputOption, shouldShowInlineOptions } from "./quickReplyOptionsUtils.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const normalized = ensureCustomOption(["品牌广告", "短剧"]);
assert(normalized.length === 3, "adds the custom option to short option groups");
assert(normalized[2] === CUSTOM_OPTION, "custom option is always last");
assert(isCustomOption("自定义"), "detects plain custom labels");
assert(isCustomOption("✏️自定义"), "detects compact custom labels");

const deduped = ensureCustomOption(["品牌广告", "自定义", "✏️ 自定义"]);
assert(deduped.length === 2, "dedupes custom variants");
assert(deduped[1] === CUSTOM_OPTION, "deduped custom option is normalized");

const shotConfirm = ensureCustomOption(["OK继续", "修改"]);
assert(shotConfirm.length === 2, "does not append custom when a direct edit option is present");
assert(shotConfirm[1] === "修改", "keeps the direct edit option label");
assert(isManualInputOption("修改"), "treats exact edit as a manual input option");
assert(!isManualInputOption("修改剧情"), "does not treat scoped edit choices as manual input");

assert(shouldShowInlineOptions("collecting", false), "shows inline options during collection");
assert(shouldShowInlineOptions("choosing", false), "shows fallback inline options if storyboard data is missing");
assert(!shouldShowInlineOptions("choosing", true), "lets the storyboard mode selector own options when data exists");
