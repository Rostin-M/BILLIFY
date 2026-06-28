// Contrato v1 — Notificaciones (correo, SMS, WhatsApp)
// Candidatos de implementación: Resend (correo), Twilio (SMS/WhatsApp).

import { type ProductData, type SaleData, safeIntegrationCall } from "./types";

export interface NotificationsAdapter {
  isEnabled(): boolean;
  enviarConfirmacionVenta(sale: SaleData, destinatario: string): Promise<void>;
  enviarRecibo(sale: SaleData, destinatario: string): Promise<void>;
  enviarAlertaInventarioBajo(product: ProductData): Promise<void>;
}

class NoOpNotificationsAdapter implements NotificationsAdapter {
  isEnabled() {
    return false;
  }

  async enviarConfirmacionVenta(_sale: SaleData, _destinatario: string) {
    return;
  }

  async enviarRecibo(_sale: SaleData, _destinatario: string) {
    return;
  }

  async enviarAlertaInventarioBajo(_product: ProductData) {
    return;
  }
}

export const notificationsAdapter: NotificationsAdapter = new NoOpNotificationsAdapter();

export async function notificarVenta(sale: SaleData, destinatario: string): Promise<void> {
  await safeIntegrationCall(
    "Notifications.confirmarVenta",
    () => notificationsAdapter.enviarConfirmacionVenta(sale, destinatario),
    undefined,
  );
}

export async function notificarInventarioBajo(product: ProductData): Promise<void> {
  await safeIntegrationCall(
    "Notifications.inventarioBajo",
    () => notificationsAdapter.enviarAlertaInventarioBajo(product),
    undefined,
  );
}
