window.__ModuleLoader__.load({
  id: "dsh-cost-bubble",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    const inject = ["slots", "timer"];

    function money(n) {
      return n == null ? "$0.000" : "$" + (n < 0.01 ? n.toFixed(4) : n.toFixed(3));
    }

    function ExpandedPanel(props) {
      const data = props.data || {};
      const t = data.tokens || {};
      const cost = data.cost || null;
      const row = { display: "flex", justifyContent: "space-between", gap: 14, lineHeight: 1.6 };
      const muted = { opacity: 0.55 };
      const sep = { marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--dsw-alias-border-l1, #333)" };
      return React.createElement("div", {
        style: {
          position: "absolute",
          right: 0,
          bottom: "calc(100% + 8px)",
          minWidth: 230,
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--dsw-alias-bg-overlay, rgba(22,22,27,0.97))",
          border: "1px solid var(--dsw-alias-border-l1, #3a3a40)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
          fontSize: 11,
          color: "var(--dsw-alias-label-primary, #e8e8ec)",
        },
      },
        React.createElement("div", { style: row },
          React.createElement("span", { style: muted }, "model"),
          React.createElement("span", null, data.model || "unknown"),
        ),
        React.createElement("div", { style: row },
          React.createElement("span", { style: muted }, "input (miss)"),
          React.createElement("span", null, Number(t.inputMiss || 0).toLocaleString()),
        ),
        React.createElement("div", { style: row },
          React.createElement("span", { style: muted }, "cache hit"),
          React.createElement("span", null, Number(t.cacheHit || 0).toLocaleString()),
        ),
        React.createElement("div", { style: row },
          React.createElement("span", { style: muted }, "cache write"),
          React.createElement("span", null, Number(t.cacheWrite || 0).toLocaleString()),
        ),
        React.createElement("div", { style: row },
          React.createElement("span", { style: muted }, "output"),
          React.createElement("span", null, Number(t.output || 0).toLocaleString()),
        ),
        React.createElement("div", { style: { ...row, ...sep, fontWeight: 600 } },
          React.createElement("span", null, "estimated"),
          React.createElement("span", null, money(cost ? cost.total : 0)),
        ),
        React.createElement("div", { style: { ...muted, fontSize: 10, marginTop: 4 } },
          "estimate — cache writes priced at input-miss rate",
        ),
      );
    }

    function CostBubble(props) {
      const useSessions = props.useSessions;
      const interval = props.interval;

      const sessionId = useSessions((s) => s.current);
      const running = useSessions((s) => {
        const id = s.current;
        if (id == null) return false;
        const entry = s.byId ? s.byId[id] : undefined;
        return entry ? entry.running === true : false;
      });

      const [data, setData] = React.useState(null);
      const [expanded, setExpanded] = React.useState(false);
      const [pos, setPos] = React.useState({ x: 0, y: 0 });
      const dragRef = React.useRef(null);
      const movedRef = React.useRef(false);

      React.useEffect(() => {
        let alive = true;
        async function refresh() {
          if (sessionId == null) return;
          try {
            const res = await fetch("/cost-bubble/usage?sessionId=" + encodeURIComponent(sessionId));
            if (!alive || !res.ok) return;
            const payload = await res.json();
            if (alive && payload && payload.ok === true) setData(payload);
          } catch (_err) { /* transient failure — keep last value */ }
        }
        refresh();
        const dispose = interval(refresh, 3000);
        return () => { alive = false; if (dispose) dispose(); };
      }, [sessionId, interval]);

      function onPointerDown(e) {
        if (e.currentTarget && e.currentTarget.setPointerCapture) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        movedRef.current = false;
        dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY };
      }
      function onPointerMove(e) {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.id) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
        setPos((p) => ({ x: (p.x || 0) + dx, y: (p.y || 0) + dy }));
        dragRef.current = { id: d.id, sx: e.clientX, sy: e.clientY };
      }
      function onPointerUp(e) {
        if (dragRef.current && e.pointerId === dragRef.current.id) dragRef.current = null;
      }
      function onClick() {
        if (!movedRef.current) setExpanded((v) => !v);
      }

      const cost = data && data.cost ? data.cost : null;
      const peak = data && data.peak === true;

      return React.createElement("div", {
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onClick: onClick,
        style: {
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 2147483000,
          transform: "translate(" + (pos.x || 0) + "px," + (pos.y || 0) + "px)",
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 12px",
          borderRadius: 999,
          background: "var(--dsw-alias-bg-overlay, rgba(22,22,27,0.92))",
          color: "var(--dsw-alias-label-primary, #e8e8ec)",
          border: "1px solid var(--dsw-alias-border-l1, #3a3a40)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
          fontSize: 12,
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          cursor: "grab",
          userSelect: "none",
          lineHeight: 1,
        },
        title: "Estimated API cost of this chat (click to expand, drag to move)",
      },
        React.createElement("span", { style: { fontWeight: 700, letterSpacing: 0.2 } },
          running ? "… " + money(cost ? cost.total : 0) : money(cost ? cost.total : 0),
        ),
        peak ? React.createElement("span", { style: { fontSize: 10, opacity: 0.65 } }, "peak") : null,
        expanded ? React.createElement(ExpandedPanel, { data: data }) : null,
      );
    }

    function apply(ctx) {
      const slots = ctx.slots;
      const interval = ctx.interval;
      slots.inject("shell.overlay", () => slots.register(
        { name: "shell.overlay", id: "cost-bubble", order: 100, label: "Token cost" },
        (props) => React.createElement(CostBubble, { ...props, interval: interval }),
      ));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
