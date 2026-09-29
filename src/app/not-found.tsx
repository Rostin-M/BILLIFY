"use client";

import { SearchX } from "lucide-react";

import { ErrorScreen } from "./_components/ErrorScreen";

export default function NotFound() {
  return (
    <ErrorScreen
      variant="fullscreen"
      icon={SearchX}
      title="Página no encontrada"
      description="La dirección que buscas no existe o fue movida."
    />
  );
}
