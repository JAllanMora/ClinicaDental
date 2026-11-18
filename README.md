# Clínica Dental Villa San Juan · Sistema de gestión

Sistema web para la Clínica Dental Villa San Juan (San Juan Solís): expediente clínico, agenda,
presupuestos, inventario y reportes. Hecho con **Next.js 16**, **Supabase** (Postgres + Auth + Storage)
y desplegado en **Vercel**.

## Fases

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Base: marca, login, roles con RLS, bitácora, pacientes, historia clínica, configuración | ✅ |
| 2 | Expediente: odontograma, periodontograma, notas de evolución, consentimiento con firma | ✅ |
| 3 | Imagenología: radiografías, fotos, DICOM, STL | ✅ |
| 4 | Agenda multi-doctor/sillón, tipos de cita, lista de espera | ✅ |
| 5 | Recordatorios por WhatsApp, SMS y correo; confirmación por enlace | ✅ |
| 6 | Presupuestos, abonos, saldos, corte de caja, comisiones (sin CFDI por ahora) | ✅ |
| 7 | Inventario por lotes con caducidades y alertas; órdenes de laboratorio | ✅ |
| 8 | Reportes, métricas y modo tablet para pacientes | ✅ |
| 9 | Horarios por odontólogo y días libres; bot de WhatsApp que agenda, confirma y recuerda | ✅ |

## Modo tablet

En *Modo tablet* (menú lateral) el personal elige al paciente del día y le entrega la tablet:

- **Cuestionario de salud**: enfermedades, alergias, medicamentos y firma. Queda aparte de la historia
  clínica hasta que el odontólogo lo revisa y lo pasa a la historia (lo ve en *Historia clínica*).
  Recepción puede entregarlo, pero no puede leer las respuestas.
- **Consentimiento informado**: el odontólogo elige el formato y anota el procedimiento; el paciente lo lee
  y firma con el dedo.

Tip: en la tablet agrega el sitio a la pantalla de inicio y usa el modo de acceso guiado (iPad) o fijar
pantalla (Android) para que el paciente no salga de la página.

## Roles y seguridad

La seguridad vive en la base de datos (Row Level Security), no sólo en la interfaz:

| Rol | Puede |
| --- | --- |
| **Recepción** | Dar de alta y editar datos generales de pacientes, ver a todos los pacientes. **No** ve información clínica. |
| **Odontólogo** | Ver y editar el expediente clínico sólo de **sus** pacientes (equipo de atención). |
| **Administrador** | Todo: personal, sucursales, sillones, bitácora y todos los expedientes. |

- **Bitácora inmutable** (`audit_log`): cada alta o cambio de pacientes, historia clínica, personal y
  configuración queda registrado con autor, fecha y campos modificados. Ni siquiera el dueño de la base
  puede editarla o borrarla.
- **El expediente no se borra** (NOM-004-SSA3): los pacientes se marcan como inactivos.
- **Usuarios nuevos quedan inactivos** hasta que un administrador los invita/activa. El primer usuario
  del sistema se convierte en administrador.
- **El dinero no se borra**: pagos y egresos se cancelan con motivo; un día con **corte de caja** cerrado ya no
  admite cobros, egresos ni cancelaciones. Los precios de tratamientos ya realizados no se pueden cambiar.
- Recepción cobra y hace el corte; el odontólogo marca tratamientos realizados (base de su comisión) y ve
  los pagos de sus pacientes, pero no la caja.
- Cifrado en tránsito (HTTPS en Vercel/Supabase) y en reposo (Supabase cifra la base y el storage con AES-256).

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (región recomendada: `us-east-1` o la más cercana).
2. Aplica las migraciones de `supabase/migrations/` en orden. Opciones:
   - Con la CLI: `npx supabase link --project-ref <ref>` y luego `npx supabase db push`.
   - O copia y pega cada archivo en **SQL Editor** → Run.
3. En **Authentication → Sign In / Providers → Email**: desactiva *Allow new users to sign up*
   (el personal entra sólo por invitación).
4. El bucket privado `clinical` (radiografías, fotos, DICOM, STL) lo crea la migración de la fase 3.
   Si tu plan de Supabase limita el tamaño de archivo, ajústalo en **Storage → Settings** (se recomienda 200 MB).
5. La agenda se actualiza en tiempo real: la migración de la fase 4 agrega `appointments` y
   `waitlist` a la publicación `supabase_realtime` (revisa en **Database → Publications** que esté activa).
6. En **Authentication → URL Configuration**: pon la URL de Vercel como *Site URL* y agrégala a *Redirect URLs*.
7. En **Authentication → Email Templates**, cambia el enlace de estas plantillas:
   - *Invite user*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
8. Crea el primer usuario (será administrador): **Authentication → Users → Add user**, con
   *Auto Confirm User* marcado.

### 2. Variables de entorno

Copia `.env.example` a `.env.local` (y agrégalas en Vercel → Settings → Environment Variables):

| Variable | Dónde se obtiene |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (publishable / anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys (secret / service_role). **Sólo servidor.** |
| `NEXT_PUBLIC_SITE_URL` | URL pública del sitio, p. ej. `https://clinica-villa-san-juan.vercel.app` |

### 3. Desarrollo local

Para probar en tu computadora sin tocar el proyecto real de Supabase. Necesitas
[Node.js 20 o más nuevo](https://nodejs.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/)
abierto y [Git](https://git-scm.com).

```bash
git clone https://github.com/JAllanMora/ClinicaDental.git
cd ClinicaDental
npm install
npx supabase start   # la primera vez descarga las imágenes (unos minutos)
```

`supabase start` levanta Postgres, Auth y Storage en Docker, aplica `supabase/migrations` y carga
`supabase/seed.sql` (pacientes, citas de hoy, un presupuesto, inventario y una orden de laboratorio).
Al terminar muestra las llaves. Crea `.env.local` con:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<"Publishable key" o "anon key">
SUPABASE_SERVICE_ROLE_KEY=<"Secret key" o "service_role key">
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

```bash
npm run dev          # http://localhost:3000
```

Usuarios de prueba (contraseña `Clinica2026!`):

| Correo | Rol |
| --- | --- |
| `admin@clinica.local` | Administrador |
| `dentista@clinica.local` | Odontóloga (Dra. Ana López) |
| `dentista2@clinica.local` | Odontólogo (Dr. Carlos Ruiz) |
| `recepcion@clinica.local` | Recepción |

- Supabase Studio (ver tablas): http://127.0.0.1:54323 · Correos de prueba (invitaciones): http://127.0.0.1:54324
- `npx supabase db reset` borra todo y vuelve a cargar los datos de demostración.
- `npx supabase stop` apaga los contenedores.
- Las citas de demostración son de hoy y mañana a partir del día en que corres el seed.

Otros comandos: `npm run lint`, `npm run typecheck`, `npm run build`.

### 4. Recordatorios (WhatsApp, SMS y correo)

- **Envío automático**: `vercel.json` programa `/api/cron/recordatorios` todos los días a las 8:00 (hora del
  centro de México). Define `CRON_SECRET` en Vercel para protegerlo. Se envía a las citas *programadas* o
  *confirmadas* del día configurado (por defecto, el día siguiente) que aún no tengan recordatorio.
- **Canal**: el que eligió el paciente en su ficha (WhatsApp, SMS, correo o ninguno). Si falta el dato,
  se usa el siguiente disponible.
- **WhatsApp y SMS** con [Twilio](https://www.twilio.com/): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM`. Para WhatsApp en producción Meta exige una plantilla aprobada:
  créala en Twilio → Content Template Builder con las variables `{{1}}` paciente, `{{2}}` fecha, `{{3}}` hora,
  `{{4}}` doctor y `{{5}}` enlace, y pon su SID en `TWILIO_WHATSAPP_CONTENT_SID`.
- **Correo** con [Resend](https://resend.com/): `RESEND_API_KEY` y `EMAIL_FROM` (dominio verificado).
- **Confirmación**: cada mensaje lleva un enlace `/c/<token>` donde el paciente confirma o pide un cambio, sin
  iniciar sesión. La agenda lo marca al instante.
- Sin credenciales todo funciona en **modo prueba**: los mensajes se registran en *Agenda → Recordatorios*
  pero no salen.

### 5. Bot de WhatsApp

El bot vive en `bot/` y corre en una computadora de la clínica (no en Vercel). Instrucciones en
[bot/README.md](bot/README.md). Los turnos de cada odontólogo y sus días libres se editan en
*Agenda → Horarios*; el bot sólo ofrece horarios dentro de ellos.

Si la app está en Vercel y el bot en la clínica, pon `WHATSAPP_PROVIDER=baileys` en Vercel: el cron diario deja
los recordatorios de WhatsApp en cola y el bot los manda.

### 6. Vercel

Importa el repositorio en Vercel, agrega las variables de entorno y despliega. No requiere configuración extra.

## Pruebas de base de datos

`npm run test:db` aplica todas las migraciones en un Postgres desechable y verifica las reglas de
acceso (26 escenarios: recepción no ve datos clínicos, un odontólogo no ve pacientes ajenos, la bitácora
es inmutable, etc.). Necesita `psql` y las variables `PGHOST`/`PGUSER`/`PGPASSWORD`. Corre en CI en cada PR.

## Estructura

```
src/
  app/
    (app)/                 # Páginas con sesión (menú lateral)
      pacientes/           # Lista, alta, ficha, historia clínica
      configuracion/       # Personal, sucursales, sillones (admin)
      bitacora/            # Auditoría (admin)
    login/ recuperar/ actualizar-contrasena/ auth/   # Acceso
  components/              # UI y logo
  lib/                     # Supabase, sesión/roles, formato, catálogos clínicos
  proxy.ts                 # Refresca la sesión y protege rutas
supabase/
  migrations/              # Esquema, RLS, triggers
  tests/                   # Pruebas de RLS
```
