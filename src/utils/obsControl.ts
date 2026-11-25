/**
 * Contrôle léger d'OBS Studio via le serveur WebSocket v5 intégré nativement à OBS (OBS 28+).
 * Aucune installation externe ni aucun sondage permanent en arrière-plan.
 */

export interface ObsStatusSnapshot {
  connected: boolean;
  streaming: boolean;
  obsVersion?: string;
  error?: string;
}

const DEFAULT_OBS_WS_URL = 'ws://127.0.0.1:4455';

function toBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

async function computeObsWebSocketAuth(
  password: string,
  salt: string,
  challenge: string
): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      "Mot de passe OBS WebSocket requis : utilisez l'appli en HTTPS ou décochez « Activer l'authentification » dans OBS (Outils → Paramètres du serveur WebSocket)."
    );
  }
  const encoder = new TextEncoder();
  const secretHash = await crypto.subtle.digest('SHA-256', encoder.encode(`${password}${salt}`));
  const base64Secret = toBase64(secretHash);
  const authHash = await crypto.subtle.digest('SHA-256', encoder.encode(`${base64Secret}${challenge}`));
  return toBase64(authHash);
}

async function callObsWebSocket<T = Record<string, any>>(
  wsUrl: string | undefined,
  password: string | undefined,
  requestType: string,
  timeoutMs: number = 2800
): Promise<T> {
  const url = (wsUrl || '').trim() || DEFAULT_OBS_WS_URL;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const reqId = `mcb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const finish = (err: Error | null, data?: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (ws) {
        try { ws.close(); } catch {}
      }
      if (err) reject(err);
      else resolve(data as T);
    };

    const timer = window.setTimeout(() => {
      finish(
        new Error(
          `OBS Studio ne répond pas sur ${url}. Vérifiez qu'OBS est ouvert et que Outils → Paramètres du serveur WebSocket est activé.`
        )
      );
    }, timeoutMs);

    try {
      ws = new WebSocket(url);
    } catch {
      finish(new Error(`Adresse OBS WebSocket invalide : ${url}`));
      return;
    }

    ws.onerror = () => {
      finish(
        new Error(
          `Impossible de joindre OBS Studio sur ${url}. Ouvrez OBS puis activez Outils → Paramètres du serveur WebSocket.`
        )
      );
    };

    ws.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        const op = msg?.op;
        const d = msg?.d;

        if (op === 0) {
          // Hello -> Identify
          const authSpec = d?.authentication;
          let authHeader: string | undefined;
          if (authSpec?.challenge && authSpec?.salt) {
            if (!password) {
              finish(
                new Error(
                  "OBS Studio demande un mot de passe WebSocket. Saisissez-le ci-dessous (ou décochez l'authentification dans OBS)."
                )
              );
              return;
            }
            authHeader = await computeObsWebSocketAuth(password, authSpec.salt, authSpec.challenge);
          }
          ws?.send(
            JSON.stringify({
              op: 1,
              d: {
                rpcVersion: 1,
                ...(authHeader ? { authentication: authHeader } : {}),
                eventSubscriptions: 0
              }
            })
          );
        } else if (op === 2) {
          // Identified -> execute request
          ws?.send(
            JSON.stringify({
              op: 6,
              d: {
                requestType,
                requestId: reqId
              }
            })
          );
        } else if (op === 7 && d?.requestId === reqId) {
          const ok = Boolean(d?.requestStatus?.result);
          const code = d?.requestStatus?.code;
          if (!ok) {
            // OBS code 500 = Output already active (StartStream) or inactive (StopStream)
            if (requestType === 'StartStream' && code === 500) {
              finish(null, { alreadyActive: true } as unknown as T);
              return;
            }
            if (requestType === 'StopStream' && code === 500) {
              finish(null, { alreadyStopped: true } as unknown as T);
              return;
            }
            finish(
              new Error(
                d?.requestStatus?.comment || `OBS a refusé la commande ${requestType} (code ${code ?? '?'}).`
              )
            );
            return;
          }
          finish(null, (d?.responseData || {}) as T);
        }
      } catch (err: any) {
        finish(err instanceof Error ? err : new Error('Réponse OBS WebSocket invalide.'));
      }
    };
  });
}

export async function checkObsStatus(wsUrl?: string, password?: string): Promise<ObsStatusSnapshot> {
  try {
    const res = await callObsWebSocket<{ outputActive?: boolean }>(wsUrl, password, 'GetStreamStatus');
    return {
      connected: true,
      streaming: Boolean(res?.outputActive)
    };
  } catch (err: any) {
    return {
      connected: false,
      streaming: false,
      error: err?.message || 'OBS Studio non détecté.'
    };
  }
}

export async function startObsStream(wsUrl?: string, password?: string): Promise<void> {
  await callObsWebSocket(wsUrl, password, 'StartStream', 3500);
}

export async function stopObsStream(wsUrl?: string, password?: string): Promise<void> {
  await callObsWebSocket(wsUrl, password, 'StopStream', 3500);
}
