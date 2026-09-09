import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { PortfolioData } from "./portfolio";

export type Backup = {
  format: "fii-guard-backup";
  version: number;
  exportedAt: string;
  operations: PortfolioData["operations"];
  dividends: PortfolioData["dividends"];
  quotes: PortfolioData["quotes"]
};

export function createBackup(data: PortfolioData): Backup {
  return {
    format: "fii-guard-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    operations: data.operations || [],
    dividends: data.dividends || [],
    quotes: data.quotes || {}
  };
}

export async function exportBackup(data: PortfolioData) {
  const backupData = createBackup(data);
  const filename = `fii-guard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify(backupData, null, 2);

  if (Platform.OS === "web") {
    // Lógica para download automático no Navegador (Web)
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  // Lógica para Android/iOS
  try {
    const baseDir = FileSystem.documentDirectory;
    if (!baseDir) throw new Error("Diretório não disponível.");
    const uri = baseDir.endsWith('/') ? `${baseDir}${filename}` : `${baseDir}/${filename}`;
    await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Salvar Backup" });
    }
  } catch (error) {
    throw new Error("Erro ao gerar arquivo de backup.");
  }
}

export async function importBackup(): Promise<Backup | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "application/octet-stream", "*/*"],
      copyToCacheDirectory: true
    });

    if (result.canceled || !result.assets?.[0]) return null;

    let raw = "";
    if (Platform.OS === "web") {
      // Na Web, o arquivo vem como um Blob/File acessível via fetch ou FileReader
      const response = await fetch(result.assets[0].uri);
      raw = await response.text();
    } else {
      raw = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
    }

    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.operations)) throw new Error("Backup inválido.");

    return {
      format: "fii-guard-backup",
      version: value.version || 1,
      exportedAt: value.exportedAt || new Date().toISOString(),
      operations: value.operations || [],
      dividends: value.dividends || [],
      quotes: value.quotes || {}
    };
  } catch (e) {
    throw new Error("Falha ao ler o backup. Verifique o arquivo.");
  }
}
