import type { Metadata } from "next";
import ChatApp from "./chat-app";

export const metadata: Metadata = {
  title: "Milo 私信",
  description: "专注、轻盈的本地私信体验。",
};

export default function Home() {
  return <ChatApp />;
}
