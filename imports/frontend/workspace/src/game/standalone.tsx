import { createRoot } from "react-dom/client";
import { HallGame } from "./HallGame";

const root = document.getElementById("root");
if (root) createRoot(root).render(<HallGame />);
