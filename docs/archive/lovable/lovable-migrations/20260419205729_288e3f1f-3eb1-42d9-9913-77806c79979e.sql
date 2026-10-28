UPDATE auth.users
SET email_confirmed_at = now()
WHERE email = 'pcosta@scoutsports.com.br' AND email_confirmed_at IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'pcosta@scoutsports.com.br'
ON CONFLICT (user_id, role) DO NOTHING;