import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// The component was originally built for Claude's artifact storage API
// (window.storage). This polyfill backs the same interface with the
// browser's localStorage, so no changes were needed in App.jsx to make
// it work on normal static hosting like GitHub Pages. Data is saved
// per-browser/device — there are no accounts, so each teacher's data
// stays local to whatever device/browser they use it on.
window.storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return { key, value: raw, shared: false };
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value, shared: false };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared: false };
  },
  async list(prefix) {
    const keys = Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
