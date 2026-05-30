import { IMAGE_MODELS } from "../../../types/model.js";

export function getImageModelOptions(): { id: string; label: string }[] {
  return IMAGE_MODELS.map((model) => ({
    id: model.id,
    label: `${model.label} (${model.provider})`,
  }));
}
