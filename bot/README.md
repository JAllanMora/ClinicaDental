# Bot de WhatsApp (Baileys)

Contesta a los pacientes por WhatsApp usando la agenda de Supabase:

- **Agendar**: elige tipo de cita → día → hora. Calcula los horarios libres con las citas, los
  bloqueos de horario, los odontólogos y los sillones activos (prefiere al odontólogo de cabecera).
  Si el número no es de un paciente registrado, le pide nombre y apellido y lo da de alta.
- **Ver / confirmar / cancelar o cambiar** sus citas próximas.
- **Recordatorios**: cada 30 min revisa las citas de dentro de `days_before` días (Configuración ›
  Recordatorios) y manda el recordatorio a pacientes con preferencia *WhatsApp*. El paciente
  responde 1 (confirmo) o 2 (cancelar/cambiar). Se registran en la bitácora de mensajes.
- **Recepción**: si el paciente escribe "recepción", el bot se calla en ese chat por 4 horas.

> ⚠️ Baileys es una conexión **no oficial** a WhatsApp Web. WhatsApp puede bloquear el número si
> detecta uso automatizado. Usa un número de prueba al principio y no mandes mensajes masivos.

## Arrancar

```powershell
cd C:\Users\Allan\ClinicaDental\bot
npm install
npm start
```

La primera vez abre `qr.html` con un código QR: en el teléfono, WhatsApp › Dispositivos vinculados ›
Vincular un dispositivo. La sesión queda en `bot/auth/` (no se sube a git; quien tenga esa carpeta
controla el número). Para desvincular: borra `bot/auth/` o cierra la sesión desde el teléfono.

## Configuración (en `../.env.local`)

| Variable | Default | Qué hace |
| --- | --- | --- |
| `BOT_MODO` | `prueba` | `produccion` = atiende a todos. En prueba sólo a `BOT_NUMEROS_PRUEBA`. |
| `BOT_NUMEROS_PRUEBA` | — | Números de 10 dígitos separados por coma. |
| `BOT_HORARIO` | `1-5=09:00-19:00;6=09:00-14:00` | Horario para ofrecer citas (0 = domingo). |
| `BOT_PASO_MINUTOS` | `30` | Cada cuánto se ofrece un horario. |
| `BOT_ANTICIPACION_HORAS` | `2` | Anticipación mínima para agendar. |
| `BOT_DIAS_ADELANTE` | `14` | Días hacia adelante para buscar horarios. |
| `BOT_RECORDATORIOS` | `si` | `no` para apagar los recordatorios del bot. |

Si se cambia algo, hay que reiniciar el bot.
