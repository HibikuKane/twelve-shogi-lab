import "./styles.css";
import { LabApp } from "./ui/app";

const root = document.querySelector<HTMLElement>("#app");

if (!root) throw new Error("#app element was not found.");

new LabApp(root);
