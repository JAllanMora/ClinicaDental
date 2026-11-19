# Bot de WhatsApp

Servicio de Node aparte (no corre en Vercel) que se conecta a un número de WhatsApp con
[Baileys](https://github.com/WhiskeySockets/Baileys), como si fuera WhatsApp Web.

> ⚠️ Baileys no es oficial. WhatsApp puede bloquear el número si detecta uso automatizado.
> Usa un número de prueba o secundario, no el principal de la clínica.

## Qué hace

- **Agenda citas**: el paciente elige tipo de cita, el bot le ofrece horarios libres reales (turnos de cada
  odontólogo en *Agenda → Horarios*, sin citas, bloqueos ni días libres, con sillón disponible) y la crea en la
  agenda marcada como *WA*. Si el número no es de un paciente, le pide nombre y apellido y lo da de alta.
- **Mis citas**: confirmar, cambiar de horario o cancelar.
- **Recordatorios**: la app los prepara (manual o el envío diario) y quedan *en cola*; el bot los manda. El
  paciente contesta 1 para confirmar o 2 para cambiarla.
- **Recepción**: si el paciente escribe 3 o "recepción", el chat aparece en *WhatsApp → Esperando a recepción* y
  el bot se calla en ese chat hasta que lo marquen atendido (o pasen `BOT_PAUSA_HUMANO_HORAS`).
- Todo queda en la bitácora de mensajes (pantalla *WhatsApp* de la app).

## Arranque

Necesita el mismo `.env.local` de la app (lo lee de la carpeta de arriba) y, en la app,
`WHATSAPP_PROVIDER=baileys` para que los recordatorios de WhatsApp se manden por el bot.

```bash
cd bot
npm install
npm start
```

La primera vez muestra un código QR en la terminal, en `bot/qr.html` (se abre solo) y en la app
(*WhatsApp*). En el teléfono: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.
La sesión queda en `bot/auth/`: quien tenga esa carpeta controla el número. No se sube a git.

## Variables (en `.env.local` o `bot/.env`)

| Variable | Para qué |
| --- | --- |
| `BOT_MODO` | `prueba` (por defecto) o `produccion`. En prueba sólo atiende a `BOT_NUMEROS_PRUEBA`. |
| `BOT_NUMEROS_PRUEBA` | Números de 10 dígitos separados por coma. |
| `CRON_SECRET` | Si está, el bot pide a la app los recordatorios del día a la hora `BOT_REMINDER_HOUR` (8 por defecto). |
| `BOT_APP_URL` | URL de la app para eso (por defecto `NEXT_PUBLIC_SITE_URL`). |
| `BOT_PAUSA_HUMANO_HORAS` | Horas que se calla en un chat pasado a recepción (4 por defecto). |

Lo demás (tipos de cita que se pueden agendar, días hacia adelante, anticipación mínima, saludo) se configura
en la app, en *WhatsApp → Configuración del bot*.

## Pruebas

`npm test` simula conversaciones completas contra un Supabase local con los datos de demostración
(`npx supabase start` en la carpeta de la app).
