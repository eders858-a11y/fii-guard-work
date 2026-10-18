import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { PortfolioData } from "./portfolio";

export type Backup = {
  format: "fii-guard-backup";
  version: number;
  exportedAt: string;
  operations: PortfolioData["operations"];
  dividends: PortfolioData["dividends"];
  quotes: PortfolioData["quotes"];
  settings?: PortfolioData["settings"];
};

export function createBackup(data: PortfolioData): Backup {
  return {
    format: "fii-guard-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    operations: data.operations || [],
    dividends: data.dividends || [],
    quotes: data.quotes || {},
    settings: data.settings
  };
}

export async function exportBackup(data: PortfolioData) {
  const backupData = createBackup(data);
  const json = JSON.stringify(backupData, null, 2);
  const filename = "fii_guard_backup.json";

  // WEB
  if (Platform.OS === "web") {
    const blob = new Blob([json], {
      type: "application/json"
    });

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

  // ANDROID / IOS
  try {
    // Tenta primeiro o diretório de cache.
    // Se não estiver disponível, usa o diretório permanente do aplicativo.
    const baseDir =
      FileSystem.cacheDirectory ||
      FileSystem.documentDirectory;

    if (!baseDir) {
      throw new Error(
        "Não foi possível encontrar um diretório para criar o backup."
      );
    }

    const uri = baseDir.endsWith("/")
      ? `${baseDir}${filename}`
      : `${baseDir}/${filename}`;

    // Cria o arquivo JSON
    await FileSystem.writeAsStringAsync(
      uri,
      json,
      {
        encoding: FileSystem.EncodingType.UTF8
      }
    );

    // Verifica se o sistema permite compartilhar o arquivo
    const sharingAvailable =
      await Sharing.isAvailableAsync();

    if (!sharingAvailable) {
      throw new Error(
        "O compartilhamento de arquivos não está disponível neste aparelho."
      );
    }

    // Abre o menu do Android para o usuário
    // salvar/enviar o arquivo.
    await Sharing.shareAsync(uri, {
      mimeType: "application/json",
      dialogTitle: "Salvar Backup FII Guard",
      UTI: "public.json"
    });

  } catch (error: any) {
    console.error(
      "Erro ao gerar backup:",
      error
    );

    throw new Error(
      `Erro ao gerar backup: ${
        error?.message ||
        "Verifique as permissões do aplicativo."
      }`
    );
  }
}

export async function importBackup(): Promise<Backup | null> {
  try {
    const result =
      await DocumentPicker.getDocumentAsync({
        type: [
          "application/json",
          "application/octet-stream"
        ],
        copyToCacheDirectory: true
      });

    if (
      result.canceled ||
      !result.assets?.[0]
    ) {
      return null;
    }

    let raw = "";

    // WEB
    if (Platform.OS === "web") {
      const response =
        await fetch(result.assets[0].uri);

      raw = await response.text();
    }

    // ANDROID / IOS
    else {
      raw =
        await FileSystem.readAsStringAsync(
          result.assets[0].uri,
          {
            encoding:
              FileSystem.EncodingType.UTF8
          }
        );
    }

    const value = JSON.parse(raw);

    // Validação básica do arquivo
    if (
      !value ||
      (
        !Array.isArray(value.operations) &&
        !Array.isArray(value.dividends)
      )
    ) {
      throw new Error(
        "Este arquivo não parece ser um backup válido do FII Guard."
      );
    }

    return {
      format: "fii-guard-backup",
      version: value.version || 1,
      exportedAt:
        value.exportedAt ||
        new Date().toISOString(),
      operations:
        value.operations || [],
      dividends:
        value.dividends || [],
      quotes:
        value.quotes || {},
      settings:
        value.settings
    };

  } catch (error) {
    console.error(
      "Erro ao importar backup:",
      error
    );

    throw new Error(
      "Falha ao ler o arquivo de backup."
    );
  }
}