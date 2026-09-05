# FII Guard Market Service

Este serviço separado consulta dados públicos por meio da biblioteca `yfinance` e expõe apenas os dados necessários ao aplicativo. O APK não executa Python; ele chama este serviço pela internet quando a carteira é aberta ou quando o usuário escolhe “Atualizar agora”.

## Executar localmente

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8500
```

Depois, informe no aplicativo o endereço acessível pelo dispositivo Android. O serviço precisa permitir `GET /health` e `GET /market/sync?symbols=HGLG11,MXRF11`.

Os dados de cotação e proventos são referências de mercado. O usuário deve conferi-los com os informes do fundo e com a fonte oficial antes de tomar decisões financeiras. O serviço não guarda a carteira nem credenciais.
