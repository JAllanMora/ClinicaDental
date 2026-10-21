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
| 4 | Agenda multi-doctor/sillón, tipos de cita, lista de espera | ⏳ |
| 5 | Recordatorios por WhatsApp y correo | ⏳ |
| 6 | Presupuestos, abonos, saldos, corte de caja, comisiones (sin CFDI por ahora) | ⏳ |
| 7 | Inventario y laboratorio | ⏳ |
| 8 | Reportes, métricas y modo tablet para pacientes | ⏳ |

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
5. En **Authentication → URL Configuration**: pon la URL de Vercel como *Site URL* y agrégala a *Redirect URLs*.
6. En **Authentication → Email Templates**, cambia el enlace de estas plantillas:
   - *Invite user*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
7. Crea el primer usuario (será administrador): **Authentication → Users → Add user**, con
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

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
```

### 4. Vercel

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
