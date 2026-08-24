/* @ds-bundle: {"format":4,"namespace":"BlynkVirtualDesignSystem_efba8f","components":[{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Spinner","sourcePath":"components/feedback/Spinner.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"SideNav","sourcePath":"components/navigation/SideNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"TopBar","sourcePath":"components/navigation/TopBar.jsx"}],"sourceHashes":{"components/brand/Logo.jsx":"69ae1068eea6","components/core/Badge.jsx":"609e24d94ca7","components/core/Button.jsx":"870f289da0a3","components/core/Card.jsx":"f87e25bb8239","components/core/Icon.jsx":"75faf070731c","components/core/IconButton.jsx":"73dda1123496","components/core/Tag.jsx":"fa5166e08fa1","components/feedback/Alert.jsx":"0ba216826f2f","components/feedback/Dialog.jsx":"87600f1608d9","components/feedback/Spinner.jsx":"e999e2ff74fe","components/feedback/Toast.jsx":"400d6710353d","components/feedback/Tooltip.jsx":"6f71bc5990ee","components/forms/Checkbox.jsx":"bd48319296bc","components/forms/Field.jsx":"327a561d223a","components/forms/Input.jsx":"e8610037cef7","components/forms/Radio.jsx":"2c86a5953188","components/forms/Select.jsx":"efdb8bd5d40f","components/forms/Switch.jsx":"f78d8f731392","components/forms/Textarea.jsx":"b367aebe57ad","components/navigation/SideNav.jsx":"59fc9f0030d0","components/navigation/Tabs.jsx":"708c1bdf0705","components/navigation/TopBar.jsx":"fa574320f9fa","ui_kits/console/DevicesScreen.jsx":"143bb9d3fe19","ui_kits/console/OverviewScreen.jsx":"80dff23ae016","ui_kits/console/SettingsScreen.jsx":"4e5b4f579c2f","ui_kits/console/Shell.jsx":"3ecb8ed12825","ui_kits/website/FeatureGrid.jsx":"0e8110b9b32e","ui_kits/website/Hero.jsx":"ad3cfffe6989","ui_kits/website/LogoStrip.jsx":"bc80cb336b6f","ui_kits/website/SiteFooter.jsx":"ce85f67e8fb1","ui_kits/website/SiteHeader.jsx":"87406bf6a03a"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.BlynkVirtualDesignSystem_efba8f = window.BlynkVirtualDesignSystem_efba8f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ASSETS = {
  full: "/assets/blynk-logo-horizontal.png",
  fullWhite: "/assets/blynk-logo-horizontal-white.png",
  mark: "/assets/blynk-mark.png"
};

/** Official Blynk Virtual Technologies lockup. Raster artwork as supplied by the brand. */
function Logo({
  variant = "full",
  tone = "dark",
  height = 32,
  assetBase = "..",
  alt = "Blynk Virtual Technologies",
  style,
  ...rest
}) {
  const key = variant === "mark" ? "mark" : tone === "light" ? "fullWhite" : "full";
  return /*#__PURE__*/React.createElement("img", _extends({
    src: assetBase + ASSETS[key],
    alt: alt,
    style: {
      height,
      width: "auto",
      display: "block",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The system's surface container: white, 14px radius, hairline border, soft cool shadow. */
function Card({
  tone = "default",
  padding = 24,
  interactive,
  children,
  style,
  ...rest
}) {
  const [hov, setHov] = React.useState(false);
  const tones = {
    default: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      boxShadow: "var(--shadow-sm)"
    },
    flat: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-default)",
      boxShadow: "none"
    },
    sunken: {
      background: "var(--surface-sunken)",
      border: "1px solid var(--border-subtle)",
      boxShadow: "none"
    },
    inverse: {
      background: "var(--surface-inverse)",
      border: "1px solid var(--border-inverse)",
      boxShadow: "var(--shadow-lg)",
      color: "var(--text-on-inverse)"
    },
    brand: {
      background: "var(--cyan-500)",
      border: "1px solid var(--cyan-500)",
      boxShadow: "var(--shadow-brand)",
      color: "#fff"
    }
  }[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      borderRadius: "var(--radius-card)",
      padding,
      transition: "box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)",
      ...tones,
      ...(interactive && hov ? {
        boxShadow: "var(--shadow-md)",
        transform: "var(--lift-hover)",
        cursor: "pointer"
      } : null),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const LUCIDE_SRC = "https://unpkg.com/lucide@0.451.0/dist/umd/lucide.js";
let loader = null;
function loadLucide() {
  if (window.lucide) return Promise.resolve(window.lucide);
  if (!loader) {
    loader = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = LUCIDE_SRC;
      s.onload = () => res(window.lucide);
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  return loader;
}

/** Lucide glyph wrapper. Blynk uses Lucide at 1.75px stroke on a 20px box. */
function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  color = "currentColor",
  style,
  ...rest
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    let dead = false;
    loadLucide().then(l => {
      if (dead || !ref.current || !l) return;
      const pascal = name.split("-").map(p => p[0].toUpperCase() + p.slice(1)).join("");
      const node = l.icons?.[pascal] || l.icons?.[name];
      if (!node) return;
      ref.current.innerHTML = "";
      ref.current.appendChild(l.createElement(node));
      const svg = ref.current.firstChild;
      if (svg) {
        svg.setAttribute("width", size);
        svg.setAttribute("height", size);
        svg.setAttribute("stroke-width", strokeWidth);
        svg.setAttribute("stroke", "currentColor");
        svg.style.display = "block";
      }
    });
    return () => {
      dead = true;
    };
  }, [name, size, strokeWidth]);
  return /*#__PURE__*/React.createElement("span", _extends({
    ref: ref,
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      width: size,
      height: size,
      color,
      flex: "0 0 auto",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  neutral: {
    background: "var(--neutral-100)",
    color: "var(--neutral-700)"
  },
  brand: {
    background: "var(--cyan-50)",
    color: "var(--cyan-700)"
  },
  success: {
    background: "var(--success-100)",
    color: "var(--success-700)"
  },
  warning: {
    background: "var(--warning-100)",
    color: "var(--warning-700)"
  },
  danger: {
    background: "var(--danger-100)",
    color: "var(--danger-700)"
  },
  ink: {
    background: "var(--neutral-1000)",
    color: "#fff"
  }
};

/** Small status pill. Optional leading dot for live/state readouts. */
function Badge({
  tone = "neutral",
  dot,
  icon,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 22,
      padding: "0 9px",
      borderRadius: "var(--radius-pill)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-semibold)",
      letterSpacing: ".01em",
      ...TONES[tone],
      ...style
    }
  }, rest), dot ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "currentColor"
    }
  }) : null, icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 13
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    h: "var(--control-h-sm)",
    px: 12,
    fs: "var(--text-sm)",
    gap: 6,
    icon: 16
  },
  md: {
    h: "var(--control-h)",
    px: 18,
    fs: "var(--text-sm)",
    gap: 8,
    icon: 18
  },
  lg: {
    h: "var(--control-h-lg)",
    px: 24,
    fs: "var(--text-base)",
    gap: 10,
    icon: 20
  }
};
const VARIANTS = {
  primary: {
    background: "var(--cyan-500)",
    color: "#fff",
    border: "1px solid var(--cyan-500)",
    boxShadow: "var(--shadow-xs)"
  },
  secondary: {
    background: "var(--neutral-0)",
    color: "var(--text-heading)",
    border: "1px solid var(--border-default)",
    boxShadow: "var(--shadow-xs)"
  },
  ink: {
    background: "var(--neutral-1000)",
    color: "#fff",
    border: "1px solid var(--neutral-1000)",
    boxShadow: "var(--shadow-xs)"
  },
  ghost: {
    background: "transparent",
    color: "var(--text-brand)",
    border: "1px solid transparent",
    boxShadow: "none"
  },
  danger: {
    background: "var(--danger-500)",
    color: "#fff",
    border: "1px solid var(--danger-500)",
    boxShadow: "var(--shadow-xs)"
  }
};
const HOVER = {
  primary: {
    background: "var(--cyan-600)",
    borderColor: "var(--cyan-600)",
    boxShadow: "var(--shadow-brand)"
  },
  secondary: {
    background: "var(--neutral-50)",
    borderColor: "var(--border-strong)"
  },
  ink: {
    background: "var(--neutral-800)",
    borderColor: "var(--neutral-800)"
  },
  ghost: {
    background: "var(--hover-tint)"
  },
  danger: {
    background: "var(--danger-700)",
    borderColor: "var(--danger-700)"
  }
};

/** Primary action control. Rounded 10px, geometric label, brand-glow on hover. */
function Button({
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  block,
  disabled,
  children,
  style,
  ...rest
}) {
  const [hov, setHov] = React.useState(false);
  const [act, setAct] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => {
      setHov(false);
      setAct(false);
    },
    onMouseDown: () => setAct(true),
    onMouseUp: () => setAct(false),
    style: {
      display: block ? "flex" : "inline-flex",
      width: block ? "100%" : undefined,
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      height: s.h,
      padding: `0 ${s.px}px`,
      borderRadius: "var(--radius-control)",
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--weight-semibold)",
      fontSize: s.fs,
      letterSpacing: "0.01em",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "var(--transition-control)",
      whiteSpace: "nowrap",
      ...VARIANTS[variant],
      ...(hov && !disabled ? HOVER[variant] : null),
      transform: act && !disabled ? "var(--press-scale)" : "none",
      opacity: disabled ? 0.42 : 1,
      ...style
    }
  }, rest), iconLeft ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft,
    size: s.icon
  }) : null, children, iconRight ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.icon
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: 32,
  md: 40,
  lg: 48
};

/** Square icon-only control for toolbars and card affordances. */
function IconButton({
  icon,
  size = "md",
  variant = "secondary",
  label,
  disabled,
  style,
  ...rest
}) {
  const [hov, setHov] = React.useState(false);
  const d = SIZES[size] || 40;
  const base = {
    secondary: {
      background: "var(--neutral-0)",
      border: "1px solid var(--border-default)",
      color: "var(--text-body)"
    },
    ghost: {
      background: "transparent",
      border: "1px solid transparent",
      color: "var(--text-muted)"
    },
    primary: {
      background: "var(--cyan-500)",
      border: "1px solid var(--cyan-500)",
      color: "#fff"
    },
    inverse: {
      background: "rgba(255,255,255,.08)",
      border: "1px solid var(--border-inverse)",
      color: "#fff"
    }
  }[variant];
  const hover = {
    secondary: {
      background: "var(--neutral-50)",
      borderColor: "var(--border-strong)",
      color: "var(--text-heading)"
    },
    ghost: {
      background: "var(--hover-tint)",
      color: "var(--text-brand)"
    },
    primary: {
      background: "var(--cyan-600)",
      borderColor: "var(--cyan-600)"
    },
    inverse: {
      background: "rgba(255,255,255,.16)"
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    disabled: disabled,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      width: d,
      height: d,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-control)",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "var(--transition-control)",
      opacity: disabled ? 0.42 : 1,
      ...base,
      ...(hov && !disabled ? hover : null),
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === "sm" ? 16 : size === "lg" ? 22 : 18
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Removable, selectable filter chip. */
function Tag({
  selected,
  onRemove,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 28,
      padding: onRemove ? "0 6px 0 11px" : "0 11px",
      borderRadius: "var(--radius-sm)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      fontWeight: "var(--weight-medium)",
      transition: "var(--transition-control)",
      background: selected ? "var(--cyan-50)" : "var(--neutral-50)",
      border: `1px solid ${selected ? "var(--cyan-300)" : "var(--border-default)"}`,
      color: selected ? "var(--cyan-700)" : "var(--text-body)",
      ...style
    }
  }, rest), children, onRemove ? /*#__PURE__*/React.createElement("button", {
    onClick: onRemove,
    "aria-label": "Remove",
    style: {
      display: "inline-flex",
      padding: 2,
      borderRadius: "var(--radius-xs)",
      background: "transparent",
      border: 0,
      cursor: "pointer",
      color: "inherit",
      opacity: .6
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 13
  })) : null);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  info: {
    bg: "var(--cyan-50)",
    bd: "var(--cyan-200)",
    fg: "var(--cyan-700)",
    icon: "info"
  },
  success: {
    bg: "var(--success-100)",
    bd: "#A9E3C6",
    fg: "var(--success-700)",
    icon: "check-circle"
  },
  warning: {
    bg: "var(--warning-100)",
    bd: "#F2D79A",
    fg: "var(--warning-700)",
    icon: "alert-triangle"
  },
  danger: {
    bg: "var(--danger-100)",
    bd: "#F3B6B0",
    fg: "var(--danger-700)",
    icon: "octagon-alert"
  }
};

/** Inline banner for page- or section-level messages. */
function Alert({
  tone = "info",
  title,
  children,
  onDismiss,
  style,
  ...rest
}) {
  const t = TONES[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      gap: 12,
      padding: "12px 14px",
      borderRadius: "var(--radius-md)",
      background: t.bg,
      border: `1px solid ${t.bd}`,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.fg,
      display: "flex",
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.icon,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "grid",
      gap: 2
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: t.fg
    }
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, children) : null), onDismiss ? /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    "aria-label": "Dismiss",
    style: {
      border: 0,
      background: "none",
      cursor: "pointer",
      color: t.fg,
      opacity: .7,
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  })) : null);
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Centred modal over a dimmed scrim. */
function Dialog({
  open,
  title,
  description,
  footer,
  onClose,
  width = 460,
  children,
  style,
  ...rest
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 60,
      display: "grid",
      placeItems: "center",
      background: "var(--surface-overlay)",
      backdropFilter: "blur(3px)",
      animation: "bvFade var(--dur-fast) var(--ease-standard)"
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("style", null, "@keyframes bvFade{from{opacity:0}to{opacity:1}}@keyframes bvPop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}"), /*#__PURE__*/React.createElement("div", _extends({
    onClick: e => e.stopPropagation(),
    style: {
      width,
      maxWidth: "92vw",
      background: "var(--surface-card)",
      borderRadius: "var(--radius-block)",
      boxShadow: "var(--shadow-xl)",
      padding: 28,
      display: "grid",
      gap: 18,
      animation: "bvPop var(--dur-base) var(--ease-out)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "grid",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-heading)"
    }
  }, title), description ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, description) : null), onClose ? /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      border: 0,
      background: "none",
      cursor: "pointer",
      color: "var(--text-faint)",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 18
  })) : null), children, footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 10
    }
  }, footer) : null));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Spinner.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Indeterminate cyan ring. */
function Spinner({
  size = 20,
  tone = "brand",
  style,
  ...rest
}) {
  const color = tone === "inverse" ? "rgba(255,255,255,.9)" : "var(--cyan-500)";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      width: size,
      height: size,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("style", null, "@keyframes bvSpin{to{transform:rotate(360deg)}}"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: "50%",
      border: `${Math.max(2, Math.round(size / 10))}px solid ${tone === "inverse" ? "rgba(255,255,255,.2)" : "var(--cyan-100)"}`,
      borderTopColor: color,
      animation: "bvSpin var(--dur-slower) linear infinite"
    }
  }));
}
Object.assign(__ds_scope, { Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Spinner.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Transient confirmation on the ink surface. Slides up, auto-dismisses. */
function Toast({
  tone = "default",
  icon,
  children,
  onDismiss,
  style,
  ...rest
}) {
  const accent = {
    default: "var(--cyan-300)",
    success: "#5BD79B",
    danger: "#F58A7C"
  }[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 14px",
      borderRadius: "var(--radius-md)",
      background: "var(--surface-inverse)",
      border: "1px solid var(--border-inverse)",
      boxShadow: "var(--shadow-xl)",
      color: "var(--text-on-inverse)",
      font: "var(--type-body-sm)",
      animation: "bvToastIn var(--dur-base) var(--ease-out)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("style", null, "@keyframes bvToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: accent,
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 17
  })) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, children), onDismiss ? /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    "aria-label": "Dismiss",
    style: {
      border: 0,
      background: "none",
      cursor: "pointer",
      color: "var(--neutral-400)",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 15
  })) : null);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Hover label on the ink surface. */
function Tooltip({
  label,
  placement = "top",
  children,
  style,
  ...rest
}) {
  const [show, setShow] = React.useState(false);
  const pos = {
    top: {
      bottom: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)"
    },
    bottom: {
      top: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)"
    },
    right: {
      left: "calc(100% + 8px)",
      top: "50%",
      transform: "translateY(-50%)"
    }
  }[placement];
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: "relative",
      display: "inline-flex",
      ...style
    },
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false)
  }, rest), children, show ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      ...pos,
      whiteSpace: "nowrap",
      zIndex: 40,
      background: "var(--surface-inverse)",
      color: "#fff",
      padding: "5px 9px",
      borderRadius: "var(--radius-sm)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-medium)",
      boxShadow: "var(--shadow-md)",
      pointerEvents: "none"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Checkbox with a 6px-radius box and cyan checked fill. */
function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 18,
      height: 18,
      borderRadius: "var(--radius-sm)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "0 0 auto",
      background: checked ? "var(--cyan-500)" : "var(--neutral-0)",
      border: `1px solid ${checked ? "var(--cyan-500)" : "var(--border-strong)"}`,
      color: "#fff",
      transition: "var(--transition-control)"
    }
  }, checked ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 13,
    strokeWidth: 3
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Label + help/error wrapper for any control. */
function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "grid",
      gap: 6,
      ...style
    }
  }, rest), label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      font: "var(--type-label)",
      color: "var(--text-heading)"
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--danger-500)",
      marginLeft: 3
    }
  }, "*") : null) : null, children, error ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--danger-700)"
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Text input — 40px tall, 10px radius, cyan focus ring. */
function Input({
  iconLeft,
  invalid,
  disabled,
  size = "md",
  style,
  ...rest
}) {
  const [foc, setFoc] = React.useState(false);
  const h = size === "sm" ? "var(--control-h-sm)" : size === "lg" ? "var(--control-h-lg)" : "var(--control-h)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      width: "100%"
    }
  }, iconLeft ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 12,
      color: "var(--text-faint)",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft,
    size: 16
  })) : null, /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    onFocus: () => setFoc(true),
    onBlur: () => setFoc(false),
    style: {
      width: "100%",
      height: h,
      padding: iconLeft ? "0 12px 0 36px" : "0 12px",
      borderRadius: "var(--radius-control)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-heading)",
      background: disabled ? "var(--neutral-50)" : "var(--neutral-0)",
      border: `1px solid ${invalid ? "var(--danger-500)" : foc ? "var(--cyan-500)" : "var(--border-default)"}`,
      boxShadow: foc ? "var(--ring-focus)" : "none",
      outline: "none",
      transition: "var(--transition-control)",
      opacity: disabled ? .6 : 1,
      ...style
    }
  }, rest)));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Single radio control; render several with a shared name. */
function Radio({
  checked,
  onChange,
  label,
  value,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(value),
    style: {
      width: 18,
      height: 18,
      borderRadius: "50%",
      flex: "0 0 auto",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--neutral-0)",
      border: `1px solid ${checked ? "var(--cyan-500)" : "var(--border-strong)"}`,
      transition: "var(--transition-control)"
    }
  }, checked ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: "var(--cyan-500)"
    }
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Native select styled to match Input, with a Lucide chevron. */
function Select({
  options = [],
  invalid,
  disabled,
  style,
  ...rest
}) {
  const [foc, setFoc] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    disabled: disabled,
    onFocus: () => setFoc(true),
    onBlur: () => setFoc(false),
    style: {
      width: "100%",
      height: "var(--control-h)",
      padding: "0 36px 0 12px",
      appearance: "none",
      borderRadius: "var(--radius-control)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      color: "var(--text-heading)",
      background: disabled ? "var(--neutral-50)" : "var(--neutral-0)",
      border: `1px solid ${invalid ? "var(--danger-500)" : foc ? "var(--cyan-500)" : "var(--border-default)"}`,
      boxShadow: foc ? "var(--ring-focus)" : "none",
      outline: "none",
      cursor: "pointer",
      transition: "var(--transition-control)",
      ...style
    }
  }, rest), options.map(o => {
    const v = typeof o === "string" ? o : o.value;
    const l = typeof o === "string" ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 12,
      pointerEvents: "none",
      color: "var(--text-muted)",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Pill toggle for instant-effect settings. */
function Switch({
  checked,
  onChange,
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 40,
      height: 22,
      borderRadius: "var(--radius-pill)",
      padding: 2,
      flex: "0 0 auto",
      background: checked ? "var(--cyan-500)" : "var(--neutral-200)",
      transition: "background-color var(--dur-base) var(--ease-standard)",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "var(--shadow-xs)",
      transform: checked ? "translateX(18px)" : "translateX(0)",
      transition: "transform var(--dur-base) var(--ease-out)"
    }
  })), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Multi-line text control, same border and focus language as Input. */
function Textarea({
  invalid,
  rows = 4,
  disabled,
  style,
  ...rest
}) {
  const [foc, setFoc] = React.useState(false);
  return /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows,
    disabled: disabled,
    onFocus: () => setFoc(true),
    onBlur: () => setFoc(false),
    style: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: "var(--radius-control)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      lineHeight: "var(--leading-normal)",
      color: "var(--text-heading)",
      background: disabled ? "var(--neutral-50)" : "var(--neutral-0)",
      border: `1px solid ${invalid ? "var(--danger-500)" : foc ? "var(--cyan-500)" : "var(--border-default)"}`,
      boxShadow: foc ? "var(--ring-focus)" : "none",
      outline: "none",
      resize: "vertical",
      transition: "var(--transition-control)",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SideNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Ink app rail: brand mark at the top, icon+label items, cyan active state. */
function SideNav({
  items = [],
  value,
  onChange,
  footer,
  width = 232,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    style: {
      width,
      background: "var(--surface-inverse)",
      color: "var(--text-on-inverse)",
      display: "flex",
      flexDirection: "column",
      padding: "20px 12px",
      gap: 4,
      ...style
    }
  }, rest), items.map(it => {
    const active = it.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      onClick: () => onChange && onChange(it.value),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 40,
        padding: "0 12px",
        borderRadius: "var(--radius-control)",
        border: 0,
        cursor: "pointer",
        textAlign: "left",
        background: active ? "rgba(0,180,232,.16)" : "transparent",
        color: active ? "var(--cyan-300)" : "var(--neutral-300)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        fontWeight: active ? "var(--weight-semibold)" : "var(--weight-medium)",
        transition: "var(--transition-control)"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 18
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, it.label), it.badge ? /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--type-mono)",
        fontSize: 11,
        color: "var(--neutral-400)"
      }
    }, it.badge) : null);
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), footer);
}
Object.assign(__ds_scope, { SideNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SideNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Underline tab bar. Active tab carries a 2px cyan rule. */
function Tabs({
  items = [],
  value,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      gap: 24,
      borderBottom: "1px solid var(--border-default)",
      ...style
    }
  }, rest), items.map(it => {
    const id = typeof it === "string" ? it : it.value;
    const label = typeof it === "string" ? it : it.label;
    const active = id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      onClick: () => onChange && onChange(id),
      style: {
        background: "none",
        border: 0,
        padding: "0 0 12px",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        fontWeight: active ? "var(--weight-semibold)" : "var(--weight-medium)",
        color: active ? "var(--text-heading)" : "var(--text-muted)",
        boxShadow: active ? "inset 0 -2px 0 var(--cyan-500)" : "none",
        transition: "var(--transition-control)"
      }
    }, label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Sticky page header: title, optional breadcrumb, search slot and actions. */
function TopBar({
  title,
  breadcrumb = [],
  actions,
  onSearch,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("header", _extends({
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      height: 64,
      padding: "0 24px",
      background: "var(--glass-fill)",
      backdropFilter: "var(--blur-glass)",
      borderBottom: "1px solid var(--border-subtle)",
      position: "sticky",
      top: 0,
      zIndex: 10,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 2
    }
  }, breadcrumb.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      font: "var(--type-body-sm)",
      fontSize: "var(--text-xs)",
      color: "var(--text-faint)"
    }
  }, breadcrumb.map((b, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: b
  }, i ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 12
  }) : null, /*#__PURE__*/React.createElement("span", null, b)))) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-h3)",
      fontSize: "var(--text-md)",
      color: "var(--text-heading)"
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), onSearch ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: 34,
      padding: "0 12px",
      borderRadius: "var(--radius-pill)",
      background: "var(--neutral-50)",
      border: "1px solid var(--border-subtle)",
      color: "var(--text-faint)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 15
  }), /*#__PURE__*/React.createElement("input", {
    onChange: e => onSearch(e.target.value),
    placeholder: "Search",
    style: {
      border: 0,
      background: "none",
      outline: "none",
      font: "var(--type-body-sm)",
      width: 150,
      color: "var(--text-heading)"
    }
  })) : null, actions);
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/DevicesScreen.jsx
try { (() => {
const DS = window.BlynkVirtualDesignSystem_efba8f || {};
const {
  Logo,
  Button,
  IconButton,
  Badge,
  Tag,
  Card,
  Icon,
  SideNav,
  TopBar,
  Tabs,
  Alert,
  Toast,
  Tooltip,
  Dialog,
  Spinner,
  Field,
  Input,
  Select,
  Checkbox,
  Switch,
  Radio,
  Textarea
} = DS;
const ROWS = [["Gateway-HAM-04", "Hamburg", "4.1.2", "27.4 °C", "offline"], ["Gateway-HAM-05", "Hamburg", "4.2.1", "26.1 °C", "online"], ["Gateway-HAM-06", "Hamburg", "4.2.1", "25.8 °C", "online"], ["Sensor-ROT-118", "Rotterdam", "4.2.1", "19.2 °C", "online"], ["Sensor-ROT-119", "Rotterdam", "4.1.2", "19.6 °C", "degraded"], ["Edge-GEN-002", "Genoa", "4.2.1", "31.0 °C", "online"]];
const TONE = {
  online: "success",
  offline: "danger",
  degraded: "warning"
};
function DevicesScreen({
  onToast
}) {
  const [q, setQ] = React.useState("");
  const [site, setSite] = React.useState("All sites");
  const [sel, setSel] = React.useState([]);
  const [confirm, setConfirm] = React.useState(false);
  const rows = ROWS.filter(r => (site === "All sites" || r[1] === site) && r[0].toLowerCase().includes(q.toLowerCase()));
  const toggle = n => setSel(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 16,
      maxWidth: 1180
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 260
    }
  }, /*#__PURE__*/React.createElement(Input, {
    iconLeft: "search",
    placeholder: "Filter by name",
    value: q,
    onChange: e => setQ(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 180
    }
  }, /*#__PURE__*/React.createElement(Select, {
    options: ["All sites", "Hamburg", "Rotterdam", "Genoa"],
    value: site,
    onChange: e => setSite(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), sel.length ? /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    iconLeft: "power",
    onClick: () => setConfirm(true)
  }, "Reboot ", sel.length) : null, /*#__PURE__*/React.createElement(Button, {
    size: "md",
    iconLeft: "download",
    variant: "ghost"
  }, "Export")), /*#__PURE__*/React.createElement(Card, {
    padding: 0,
    style: {
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "var(--surface-sunken)"
    }
  }, ["", "Device", "Site", "Firmware", "Reading", "Status", ""].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: i,
    style: {
      textAlign: "left",
      padding: "11px 14px",
      fontFamily: "var(--font-display)",
      fontSize: "var(--text-xs)",
      fontWeight: 700,
      letterSpacing: "var(--tracking-caps)",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      borderBottom: "1px solid var(--border-default)"
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r[0]
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Checkbox, {
    checked: sel.includes(r[0]),
    onChange: () => toggle(r[0])
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-subtle)",
      font: "var(--type-mono)",
      fontSize: 12,
      color: "var(--text-heading)"
    }
  }, r[0]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-subtle)",
      font: "var(--type-body-sm)"
    }
  }, r[1]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-subtle)",
      font: "var(--type-mono)",
      fontSize: 12,
      color: r[2] === "4.2.1" ? "var(--text-muted)" : "var(--warning-700)"
    }
  }, r[2]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-subtle)",
      font: "var(--type-mono)",
      fontSize: 12,
      color: "var(--text-body)"
    }
  }, r[3]), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: TONE[r[4]],
    dot: true
  }, r[4])), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-subtle)",
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(Tooltip, {
    label: "Reboot device"
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "power",
    variant: "ghost",
    size: "sm",
    label: "Reboot",
    onClick: () => {
      setSel([r[0]]);
      setConfirm(true);
    }
  })))))))), /*#__PURE__*/React.createElement(Dialog, {
    open: confirm,
    onClose: () => setConfirm(false),
    title: `Reboot ${sel.length} device${sel.length === 1 ? "" : "s"}?`,
    description: "Devices go offline for about 40 seconds. Queued telemetry is retained.",
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setConfirm(false)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      iconLeft: "power",
      onClick: () => {
        setConfirm(false);
        onToast && onToast(`Reboot queued for ${sel.length} device${sel.length === 1 ? "" : "s"}`);
        setSel([]);
      }
    }, "Reboot"))
  }));
}
window.DevicesScreen = DevicesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/DevicesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/OverviewScreen.jsx
try { (() => {
const DS = window.BlynkVirtualDesignSystem_efba8f || {};
const {
  Logo,
  Button,
  IconButton,
  Badge,
  Tag,
  Card,
  Icon,
  SideNav,
  TopBar,
  Tabs,
  Alert,
  Toast,
  Tooltip,
  Dialog,
  Spinner,
  Field,
  Input,
  Select,
  Checkbox,
  Switch,
  Radio,
  Textarea
} = DS;
const KPIS = [{
  label: "Devices reporting",
  value: "412",
  of: "/ 418",
  tone: "success",
  delta: "+6 today"
}, {
  label: "Ingest rate",
  value: "24.8k",
  of: "msg/min",
  tone: "brand",
  delta: "steady"
}, {
  label: "Open alerts",
  value: "3",
  of: "",
  tone: "warning",
  delta: "1 critical"
}, {
  label: "Firmware current",
  value: "98.6",
  of: "%",
  tone: "brand",
  delta: "6 behind"
}];
const ACTIVITY = [["check-circle", "Firmware 4.2.1 rolled out to 412 devices", "12 min ago"], ["cpu", "Gateway-HAM-07 provisioned by m.keller", "48 min ago"], ["bell-ring", "Alert: HAM-04 unreachable", "1 h ago"], ["workflow", "Automation “night throttle” enabled", "3 h ago"]];
function OverviewScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 20,
      maxWidth: 1180
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 16
    }
  }, KPIS.map(k => /*#__PURE__*/React.createElement(Card, {
    key: k.label,
    padding: 20
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, k.label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 6,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-2xl)",
      color: "var(--text-heading)",
      letterSpacing: "-.02em"
    }
  }, k.value), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-faint)"
    }
  }, k.of)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: k.tone,
    dot: true
  }, k.delta))))), /*#__PURE__*/React.createElement(Alert, {
    tone: "warning",
    title: "6 gateways are behind on firmware",
    onDismiss: () => {}
  }, "They are still on 4.1.2. Schedule a rollout window from the Devices view."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.5fr 1fr",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: 24
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--text-lg)",
      flex: 1
    }
  }, "Ingest \u2014 last 24 h"), /*#__PURE__*/React.createElement(Tag, {
    selected: true
  }, "24 h"), /*#__PURE__*/React.createElement(Tag, null, "7 d")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      display: "flex",
      alignItems: "flex-end",
      gap: 5,
      height: 150
    }
  }, [38, 44, 41, 52, 60, 57, 49, 63, 71, 66, 58, 62, 74, 81, 76, 69, 72, 84, 79, 73, 68, 77, 86, 82].map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: v + "%",
      borderRadius: "3px 3px 0 0",
      background: i > 20 ? "var(--cyan-500)" : "var(--cyan-200)"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 10,
      font: "var(--type-mono)",
      fontSize: 10,
      color: "var(--text-faint)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "00:00"), /*#__PURE__*/React.createElement("span", null, "08:00"), /*#__PURE__*/React.createElement("span", null, "16:00"), /*#__PURE__*/React.createElement("span", null, "now"))), /*#__PURE__*/React.createElement(Card, {
    padding: 24
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--text-lg)"
    }
  }, "Activity"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 14,
      marginTop: 18
    }
  }, ACTIVITY.map(([icon, text, when]) => /*#__PURE__*/React.createElement("div", {
    key: text,
    style: {
      display: "flex",
      gap: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--cyan-600)",
      display: "flex",
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, text), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-mono)",
      fontSize: 10,
      color: "var(--text-faint)",
      marginTop: 3
    }
  }, when))))))));
}
window.OverviewScreen = OverviewScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/OverviewScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/SettingsScreen.jsx
try { (() => {
const DS = window.BlynkVirtualDesignSystem_efba8f || {};
const {
  Logo,
  Button,
  IconButton,
  Badge,
  Tag,
  Card,
  Icon,
  SideNav,
  TopBar,
  Tabs,
  Alert,
  Toast,
  Tooltip,
  Dialog,
  Spinner,
  Field,
  Input,
  Select,
  Checkbox,
  Switch,
  Radio,
  Textarea
} = DS;
function SettingsScreen({
  onToast
}) {
  const [tab, setTab] = React.useState("General");
  const [auto, setAuto] = React.useState(true);
  const [digest, setDigest] = React.useState(false);
  const [poll, setPoll] = React.useState("hourly");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 20,
      maxWidth: 760
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    items: ["General", "Notifications", "API keys", "Members"],
    value: tab,
    onChange: setTab
  }), /*#__PURE__*/React.createElement(Card, {
    padding: 28
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--text-lg)"
    }
  }, "Workspace"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 18,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Workspace name",
    hint: "Shown in the console header and on exports."
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: "Northern Terminals"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Default site"
  }, /*#__PURE__*/React.createElement(Select, {
    options: ["Hamburg", "Rotterdam", "Genoa"],
    defaultValue: "Hamburg"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Polling interval"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 20,
      paddingTop: 4
    }
  }, /*#__PURE__*/React.createElement(Radio, {
    value: "hourly",
    checked: poll === "hourly",
    onChange: setPoll,
    label: "Hourly"
  }), /*#__PURE__*/React.createElement(Radio, {
    value: "daily",
    checked: poll === "daily",
    onChange: setPoll,
    label: "Daily"
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Provisioning notes"
  }, /*#__PURE__*/React.createElement(Textarea, {
    rows: 3,
    placeholder: "Anything an engineer on site should know."
  })))), /*#__PURE__*/React.createElement(Card, {
    padding: 28
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "var(--text-lg)"
    }
  }, "Automation"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 14,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Switch, {
    checked: auto,
    onChange: setAuto,
    label: "Auto-provision new gateways"
  }), /*#__PURE__*/React.createElement(Checkbox, {
    checked: digest,
    onChange: setDigest,
    label: "Send me a weekly fleet digest"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement(Button, {
    onClick: () => onToast && onToast("Settings saved")
  }, "Save changes"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "Discard"))));
}
window.SettingsScreen = SettingsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/SettingsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/Shell.jsx
try { (() => {
const DS = window.BlynkVirtualDesignSystem_efba8f || {};
const {
  Logo,
  Button,
  IconButton,
  Badge,
  Tag,
  Card,
  Icon,
  SideNav,
  TopBar,
  Tabs,
  Alert,
  Toast,
  Tooltip,
  Dialog,
  Spinner,
  Field,
  Input,
  Select,
  Checkbox,
  Switch,
  Radio,
  Textarea
} = DS;
const NAV = [{
  value: "overview",
  label: "Overview",
  icon: "layout-dashboard"
}, {
  value: "devices",
  label: "Devices",
  icon: "cpu",
  badge: 418
}, {
  value: "alerts",
  label: "Alerts",
  icon: "bell-ring",
  badge: 3
}, {
  value: "automations",
  label: "Automations",
  icon: "workflow"
}, {
  value: "settings",
  label: "Settings",
  icon: "settings"
}];
const TITLES = {
  overview: {
    title: "Overview",
    crumb: ["Fleet"]
  },
  devices: {
    title: "Devices",
    crumb: ["Fleet", "Hamburg"]
  },
  alerts: {
    title: "Alerts",
    crumb: ["Fleet"]
  },
  automations: {
    title: "Automations",
    crumb: ["Fleet"]
  },
  settings: {
    title: "Settings",
    crumb: ["Account"]
  }
};
function Shell({
  view,
  onView,
  actions,
  children
}) {
  const t = TITLES[view] || TITLES.overview;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      minHeight: "100vh",
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement(SideNav, {
    value: view,
    onChange: onView,
    items: NAV,
    style: {
      position: "sticky",
      top: 0,
      height: "100vh"
    },
    footer: /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderTop: "1px solid var(--border-inverse)"
      }
    }, /*#__PURE__*/React.createElement(Logo, {
      variant: "mark",
      height: 20,
      assetBase: "../.."
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--type-mono)",
        fontSize: 10,
        color: "var(--neutral-500)"
      }
    }, "v4.2.1"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    title: t.title,
    breadcrumb: t.crumb,
    onSearch: () => {},
    actions: actions
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      padding: "28px 32px 48px"
    }
  }, children)));
}
window.Shell = Shell;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/FeatureGrid.jsx
try { (() => {
const {
  Logo,
  Button,
  Badge,
  Card,
  Icon
} = window.BlynkVirtualDesignSystem_efba8f || {};
const FEATURES = [{
  icon: "cpu",
  title: "Fleet provisioning",
  body: "Zero-touch onboarding for gateways, sensors and edge nodes — one manifest, any site."
}, {
  icon: "activity",
  title: "Live telemetry",
  body: "Sub-second streams with retention you control, queryable from the console or the API."
}, {
  icon: "shield-check",
  title: "Access & audit",
  body: "Role-scoped access down to a single device, with an immutable trail of every command."
}];
function FeatureGrid() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "var(--section-y) 40px",
      maxWidth: "var(--container-max)",
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "bv-eyebrow"
  }, "PLATFORM"), /*#__PURE__*/React.createElement("h2", {
    style: {
      marginTop: 12,
      maxWidth: 620
    }
  }, "Everything between the device and the dashboard"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 20,
      marginTop: 40
    }
  }, FEATURES.map(f => /*#__PURE__*/React.createElement(Card, {
    key: f.title,
    padding: 28,
    interactive: true
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 46,
      height: 46,
      borderRadius: "var(--radius-md)",
      background: "var(--cyan-50)",
      color: "var(--cyan-600)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: f.icon,
    size: 22
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      marginTop: 18,
      fontSize: "var(--text-lg)"
    }
  }, f.title), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)",
      marginTop: 8
    }
  }, f.body)))));
}
window.FeatureGrid = FeatureGrid;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/FeatureGrid.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Hero.jsx
try { (() => {
const {
  Logo,
  Button,
  Badge,
  Card,
  Icon
} = window.BlynkVirtualDesignSystem_efba8f || {};
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: "var(--surface-inverse)",
      color: "var(--text-on-inverse)",
      padding: "104px 40px 96px",
      position: "relative",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "radial-gradient(1100px 520px at 78% -8%, rgba(0,180,232,.22), transparent 62%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "1.05fr .95fr",
      gap: 64,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 22,
      justifyItems: "start"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "brand",
    dot: true
  }, "Platform 4.2 is live"), /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-display)",
      color: "#fff",
      maxWidth: 620
    }
  }, "The connective layer for industrial hardware"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      fontSize: "var(--text-md)",
      color: "var(--text-on-inverse-muted)",
      maxWidth: 520
    }
  }, "Provision, monitor and update fleets of connected devices from one console \u2014 with the telemetry, access control and audit trail your operations team already expects."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    iconRight: "arrow-right"
  }, "Request a demo"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "secondary",
    iconLeft: "play",
    style: {
      background: "rgba(255,255,255,.06)",
      borderColor: "var(--border-inverse)",
      color: "#fff"
    }
  }, "Watch the tour"))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: "var(--radius-block)",
      overflow: "hidden",
      border: "1px solid var(--border-inverse)",
      background: "var(--surface-inverse-soft)",
      boxShadow: "var(--shadow-xl)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "12px 14px",
      borderBottom: "1px solid var(--border-inverse)"
    }
  }, ["#F58A7C", "#E5C05B", "#5BD79B"].map(c => /*#__PURE__*/React.createElement("span", {
    key: c,
    style: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: c
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-mono)",
      fontSize: 11,
      color: "var(--neutral-500)",
      marginLeft: 10
    }
  }, "console.blynkvirtual \u2014 fleet/hamburg")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      display: "grid",
      gap: 12
    }
  }, [["Gateway-HAM-04", "27.4 °C", "online"], ["Gateway-HAM-05", "26.1 °C", "online"], ["Gateway-HAM-06", "—", "offline"]].map(([n, t, s]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      borderRadius: "var(--radius-md)",
      background: "rgba(255,255,255,.04)",
      border: "1px solid var(--border-inverse)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: s === "online" ? "#5BD79B" : "#F58A7C"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-mono)",
      fontSize: 12,
      color: "#fff",
      flex: 1
    }
  }, n), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-mono)",
      fontSize: 12,
      color: "var(--cyan-300)"
    }
  }, t)))))));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/LogoStrip.jsx
try { (() => {
const {
  Logo,
  Button,
  Badge,
  Card,
  Icon
} = window.BlynkVirtualDesignSystem_efba8f || {};
function LogoStrip() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      borderTop: "1px solid var(--border-subtle)",
      borderBottom: "1px solid var(--border-subtle)",
      background: "var(--surface-sunken)",
      padding: "34px 40px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      gap: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-faint)",
      whiteSpace: "nowrap"
    }
  }, "Trusted on the floor at"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      flex: 1
    }
  }, [0, 1, 2, 3, 4].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: 34,
      borderRadius: "var(--radius-sm)",
      background: "var(--neutral-100)",
      display: "grid",
      placeItems: "center",
      font: "var(--type-mono)",
      fontSize: 9,
      color: "var(--text-faint)"
    }
  }, "customer mark")))));
}
window.LogoStrip = LogoStrip;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/LogoStrip.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SiteFooter.jsx
try { (() => {
const {
  Logo,
  Button,
  Badge,
  Card,
  Icon
} = window.BlynkVirtualDesignSystem_efba8f || {};
const COLS = {
  Platform: ["Provisioning", "Telemetry", "Automations", "API"],
  Company: ["About", "Careers", "Press", "Contact"],
  Resources: ["Docs", "Status", "Changelog", "Security"]
};
function SiteFooter() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: "var(--surface-inverse)",
      color: "var(--text-on-inverse-muted)",
      padding: "56px 40px 34px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "1.4fr repeat(3,1fr)",
      gap: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 16,
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    tone: "light",
    height: 26,
    assetBase: "../.."
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--neutral-400)",
      maxWidth: 280
    }
  }, "The connective layer for industrial hardware.")), Object.entries(COLS).map(([head, items]) => /*#__PURE__*/React.createElement("div", {
    key: head,
    style: {
      display: "grid",
      gap: 10,
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--tracking-eyebrow)",
      textTransform: "uppercase",
      color: "#fff"
    }
  }, head), items.map(i => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: "#",
    style: {
      font: "var(--type-body-sm)",
      color: "var(--neutral-400)",
      textDecoration: "none"
    }
  }, i))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "40px auto 0",
      paddingTop: 20,
      borderTop: "1px solid var(--border-inverse)",
      display: "flex",
      gap: 20,
      font: "var(--type-body-sm)",
      color: "var(--neutral-500)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Blynk Virtual Technologies"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", null, "Privacy"), /*#__PURE__*/React.createElement("span", null, "Terms")));
}
window.SiteFooter = SiteFooter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SiteFooter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SiteHeader.jsx
try { (() => {
const {
  Logo,
  Button,
  Badge,
  Card,
  Icon
} = window.BlynkVirtualDesignSystem_efba8f || {};
function SiteHeader({
  onNav
}) {
  const links = ["Platform", "Solutions", "Developers", "Company"];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 20,
      display: "flex",
      alignItems: "center",
      gap: 32,
      height: 72,
      padding: "0 40px",
      background: "var(--glass-fill)",
      backdropFilter: "var(--blur-glass)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    height: 26,
    assetBase: "../.."
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      gap: 26
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNav && onNav(l);
    },
    style: {
      font: "var(--type-body-sm)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--text-body)",
      textDecoration: "none"
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      font: "var(--type-body-sm)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--text-body)",
      textDecoration: "none"
    }
  }, "Sign in"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    iconRight: "arrow-right"
  }, "Request a demo"));
}
window.SiteHeader = SiteHeader;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SiteHeader.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.SideNav = __ds_scope.SideNav;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.TopBar = __ds_scope.TopBar;

})();
