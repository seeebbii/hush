import { createRoot } from "react-dom/client";
import { Options } from "./Options";
import "../styles/globals.css";

const root = document.getElementById("root")!;
createRoot(root).render(<Options />);
