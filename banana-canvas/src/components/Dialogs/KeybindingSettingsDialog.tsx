import { useUIStore } from "../../stores/uiStore";
import type { MouseButton, ZoomDirection, KeybindingConfig } from "../../stores/uiStore";

interface KeybindingSettingsDialogProps {
  onClose: () => void;
}

const MOUSE_BUTTONS: { value: MouseButton; label: string }[] = [
  { value: "left", label: "左键" },
  { value: "middle", label: "中键" },
  { value: "right", label: "右键" },
];

const ZOOM_DIRECTIONS: { value: ZoomDirection; label: string; desc: string }[] = [
  { value: "normal", label: "默认", desc: "滚轮上=放大，滚轮下=缩小" },
  { value: "reverse", label: "反向", desc: "滚轮上=缩小，滚轮下=放大" },
];

function RadioGroup<T extends string>({ options, value, onChange, isDark }: {
  options: { value: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: `1px solid ${active ? "#3b82f6" : isDark ? "#3f3f46" : "#d4d4d8"}`,
              background: active ? "rgba(59,130,246,0.15)" : isDark ? "#18181b" : "#ffffff",
              color: active ? "#60a5fa" : isDark ? "#a1a1aa" : "#71717a",
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
            {opt.desc && (
              <div style={{ fontSize: 9, color: isDark ? "#52525b" : "#a1a1aa", marginTop: 2 }}>{opt.desc}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({ label, hint, children, isDark }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#e4e4e7" : "#18181b", marginBottom: 4 }}>
        {label}
      </div>
      {hint && <div style={{ fontSize: 10, color: isDark ? "#71717a" : "#a1a1aa", marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

export function KeybindingSettingsDialog({ onClose }: KeybindingSettingsDialogProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const keybinding = useUIStore((s) => s.keybinding);
  const setKeybinding = useUIStore((s) => s.setKeybinding);

  const handleSelectButton = (v: MouseButton) => {
    if (v === keybinding.panButton) {
      useUIStore.getState().addToast("warning", "框选按键不能与平移按键相同");
      return;
    }
    setKeybinding({ selectButton: v });
  };

  const handlePanButton = (v: MouseButton) => {
    if (v === keybinding.selectButton) {
      useUIStore.getState().addToast("warning", "平移按键不能与框选按键相同");
      return;
    }
    setKeybinding({ panButton: v });
  };

  const handleZoomDirection = (v: ZoomDirection) => {
    setKeybinding({ zoomDirection: v });
  };

  const handleReset = () => {
    setKeybinding({ selectButton: "left", panButton: "middle", zoomDirection: "normal" });
    useUIStore.getState().addToast("success", "按键设置已重置");
  };

  const currentConfig: KeybindingConfig = {
    selectButton: keybinding.selectButton,
    panButton: keybinding.panButton,
    zoomDirection: keybinding.zoomDirection,
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 420, maxHeight: "80vh", overflowY: "auto",
          borderRadius: 12,
          background: isDark ? "#18181b" : "#ffffff",
          border: `1px solid ${isDark ? "#27272a" : "#e4e4e7"}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 16, marginRight: 8 }}>⌨️</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#e4e4e7" : "#18181b" }}>按键设置</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: isDark ? "#71717a" : "#a1a1aa", cursor: "pointer", fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Current config summary */}
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16,
          background: isDark ? "#0f0f0f" : "#f4f4f5",
          border: `1px solid ${isDark ? "#27272a" : "#e4e4e7"}`,
        }}>
          <div style={{ fontSize: 10, color: isDark ? "#71717a" : "#a1a1aa", marginBottom: 4 }}>当前配置</div>
          <div style={{ fontSize: 11, color: isDark ? "#a1a1aa" : "#52525b" }}>
            框选：<b style={{ color: isDark ? "#60a5fa" : "#2563eb" }}>{MOUSE_BUTTONS.find(b => b.value === currentConfig.selectButton)?.label}</b>
            {" | "}
            平移：<b style={{ color: isDark ? "#60a5fa" : "#2563eb" }}>{MOUSE_BUTTONS.find(b => b.value === currentConfig.panButton)?.label}</b>
            {" | "}
            缩放：<b style={{ color: isDark ? "#60a5fa" : "#2563eb" }}>{ZOOM_DIRECTIONS.find(d => d.value === currentConfig.zoomDirection)?.label}</b>
          </div>
        </div>

        {/* Selection button */}
        <SettingRow label="框选按键" hint="在画布空白处按住此键拖动来框选节点" isDark={isDark}>
          <RadioGroup options={MOUSE_BUTTONS} value={keybinding.selectButton} onChange={handleSelectButton} isDark={isDark} />
        </SettingRow>

        {/* Pan button */}
        <SettingRow label="平移画布按键" hint="按住此键拖动来平移/移动画布视图" isDark={isDark}>
          <RadioGroup options={MOUSE_BUTTONS} value={keybinding.panButton} onChange={handlePanButton} isDark={isDark} />
        </SettingRow>

        {/* Zoom direction */}
        <SettingRow label="画布缩放方向" hint="滚轮缩放的方向偏好" isDark={isDark}>
          <RadioGroup options={ZOOM_DIRECTIONS} value={keybinding.zoomDirection} onChange={handleZoomDirection} isDark={isDark} />
        </SettingRow>

        {/* Tips */}
        <div style={{
          padding: "8px 12px", borderRadius: 8,
          background: isDark ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.05)",
          border: `1px solid ${isDark ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.15)"}`,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, color: isDark ? "#60a5fa" : "#2563eb", fontWeight: 600, marginBottom: 4 }}>操作提示</div>
          <div style={{ fontSize: 10, color: isDark ? "#a1a1aa" : "#71717a", lineHeight: 1.6 }}>
            · 单击节点可选中，单击空白处取消选中<br />
            · 选中节点后可拖动移动，多选节点可整体移动<br />
            · 滚轮缩放画布，方向由设置决定<br />
            · 所有设置自动保存到本地
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: "6px 16px", borderRadius: 8,
              border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
              background: "transparent",
              color: isDark ? "#a1a1aa" : "#71717a",
              fontSize: 12, cursor: "pointer",
            }}
          >
            重置默认
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 20px", borderRadius: 8,
              border: "none",
              background: "#3b82f6",
              color: "#ffffff",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
