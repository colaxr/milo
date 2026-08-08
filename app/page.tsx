import type { Metadata } from "next";
import ChatApp from "./chat-app";

export const metadata: Metadata = {
  title: "青屿云盘",
  description: "青屿云盘",
};

export default function Home() {
  return <ChatApp />;
}
