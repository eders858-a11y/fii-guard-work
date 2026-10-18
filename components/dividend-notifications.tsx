
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { usePortfolio, valueOfDividend } from "@/lib/portfolio";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NOTIFICATION_SOURCE = "fii-guard-proventos";
const CHANNEL_ID = "proventos";
const MAX_DATES = 50;

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function parseLocalDate(dateString: string): Date | null {
  const parts = dateString.split("-").map(Number);

  if (
    parts.length !== 3 ||
    !parts.every(Number.isFinite)
  ) {
    return null;
  }

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day, 9, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export default function DividendNotifications() {
  const { ready, dividends, operations } = usePortfolio();
  const runRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === "web") return;

    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Proventos de FIIs",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready || Platform.OS === "web") return;

    const runId = ++runRef.current;

    async function updateNotifications() {
      try {
        let permission = await Notifications.getPermissionsAsync();

        if (!permission.granted) {
          permission = await Notifications.requestPermissionsAsync();
        }

        if (!permission.granted || runId !== runRef.current) {
          return;
        }

        const totals = new Map<string, number>();

        for (const dividend of dividends) {
          if (dividend.source === "b3") continue;
          if (!dividend.paymentDate) continue;

          const amount = valueOfDividend(dividend, operations);

          if (!Number.isFinite(amount) || amount <= 0) continue;

          totals.set(
            dividend.paymentDate,
            (totals.get(dividend.paymentDate) || 0) + amount
          );
        }

        const now = new Date();

        const upcoming = [...totals.entries()]
          .map(([paymentDate, total]) => ({
            paymentDate,
            total,
            triggerDate: parseLocalDate(paymentDate),
          }))
          .filter((item) => {
            if (!item.triggerDate || item.total <= 0) return false;

            // Não agenda datas passadas nem horários das 9h que já passaram.
            return item.triggerDate.getTime() > now.getTime();
          })
          .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
          .slice(0, MAX_DATES);

        const scheduled =
          await Notifications.getAllScheduledNotificationsAsync();

        const existingIds = scheduled
          .filter(
            (notification) =>
              notification.content.data?.source === NOTIFICATION_SOURCE
          )
          .map((notification) => notification.identifier);

        for (const identifier of existingIds) {
          if (runId !== runRef.current) return;

          await Notifications.cancelScheduledNotificationAsync(identifier);
        }

        for (const item of upcoming) {
          if (runId !== runRef.current) return;
          if (!item.triggerDate) continue;

          const [year, month, day] = item.paymentDate.split("-");
          const formattedDate = `${day}/${month}/${year}`;

          const identifier = await Notifications.scheduleNotificationAsync({
            content: {
              title: "Proventos de FIIs",
              body: `Previsão de ${formatMoney(item.total)} para ${formattedDate}.`,
              sound: "default",
              data: {
                source: NOTIFICATION_SOURCE,
                paymentDate: item.paymentDate,
              },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: item.triggerDate,
              channelId: CHANNEL_ID,
            },
          });

          // Se os dados mudaram durante o agendamento, cancela o aviso antigo.
          if (runId !== runRef.current) {
            await Notifications.cancelScheduledNotificationAsync(identifier);
            return;
          }
        }
      } catch (error) {
        console.warn(
          "Não foi possível atualizar as notificações de proventos:",
          error
        );
      }
    }

    updateNotifications();

    return () => {
      if (runRef.current === runId) {
        runRef.current++;
      }
    };
  }, [ready, dividends, operations]);

  return null;
}