import { createFileRoute } from "@tanstack/react-router";
import { HallGame } from "@/game/HallGame";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HallGame />;
}
