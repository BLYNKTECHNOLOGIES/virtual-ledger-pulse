-- Fix registration RPC: register_user_request uses crypt(..., gen_salt('bf'))
-- gen_salt() is provided by the pgcrypto extension.

create extension if not exists pgcrypto;