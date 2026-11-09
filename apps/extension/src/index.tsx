import { createRoot } from "react-dom/client";
import { App } from "./ui";
import styles from "./style.css?inline";

const hostId = "anchorread-extension-root";
if (!document.getElementById(hostId)) {
  const host = document.createElement("div");
  host.id = hostId;
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const mount = document.createElement("div");
  shadow.append(style, mount);
  document.documentElement.append(host);
  createRoot(mount).render(<App host={host} />);
}
