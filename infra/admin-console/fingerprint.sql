-- Session-local protection only; never install a function in the application database.
CREATE FUNCTION pg_temp.sg_admin_old_state(include_admin boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $fingerprint$
DECLARE result jsonb := '{}'::jsonb; item record; rows jsonb;
BEGIN
  FOR item IN SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND (include_admin OR n.nspname<>'admin_console')
      AND c.relkind IN ('r','p','m','S') ORDER BY n.nspname,c.relname LOOP
    IF item.relkind='S' THEN
      -- log_cnt is a WAL cache detail changed by pg_restore/setval, not sequence state.
      EXECUTE format('SELECT jsonb_build_array(last_value,is_called) FROM %I.%I',item.nspname,item.relname) INTO rows;
      rows := rows || (SELECT jsonb_build_array(seqstart,seqincrement,seqmax,seqmin,seqcache,seqcycle) FROM pg_sequence WHERE seqrelid=format('%I.%I',item.nspname,item.relname)::regclass);
    ELSE
      EXECUTE format('SELECT jsonb_build_array(count(*), encode(sha256(convert_to(coalesce(string_agg(h,'''' ORDER BY h),''''),''UTF8'')),''hex'')) FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'') h FROM %I.%I t) s', item.nspname,item.relname) INTO rows;
    END IF;
    result := result || jsonb_build_object(item.nspname||'.'||item.relname, rows);
  END LOOP;
  RETURN jsonb_build_object('rows',result,
    'database',(SELECT jsonb_build_array(d.datname,pg_get_userbyid(d.datdba),d.encoding,d.datcollate,d.datctype,
      (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantor::regrole::text,a.grantee::regrole::text,a.privilege_type)
       FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE a.grantee<>coalesce((SELECT oid FROM pg_roles WHERE rolname='management_app'),0) OR a.grantee=0)) FROM pg_database d WHERE d.datname=current_database()),
    'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig) ORDER BY rolname) FROM pg_roles WHERE rolname <> 'management_app'),
    'members',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option) ORDER BY roleid::regrole::text,member::regrole::text,grantor::regrole::text) FROM pg_auth_members),
    'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),
      (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantor::regrole::text,a.grantee::regrole::text,a.privilege_type) FROM aclexplode(coalesce(nspacl,acldefault('n',nspowner))) a)) ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema','admin_console')),
    'relations',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relpersistence,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
      (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantor::regrole::text,a.grantee::regrole::text,a.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a),
      CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) END) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND c.relkind IN ('r','p','S','v','m','f')),
    'columns',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),
      (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(a.attacl) x)) ORDER BY n.nspname,c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','S','v','m','f')),
    'constraints',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,x.conname,pg_get_constraintdef(x.oid),x.convalidated) ORDER BY n.nspname,c.relname,x.conname) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console')),
    'indexes',(SELECT jsonb_agg(jsonb_build_array(schemaname,tablename,indexname,indexdef) ORDER BY schemaname,tablename,indexname) FROM pg_indexes WHERE schemaname !~ '^pg_' AND schemaname NOT IN ('information_schema','admin_console')),
    'routines',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,pg_get_functiondef(p.oid),
      (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantor::regrole::text,a.grantee::regrole::text,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND p.prokind<>'a'),
    'defaults',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype,
      (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantor::regrole::text,a.grantee::regrole::text,a.privilege_type) FROM aclexplode(d.defaclacl) a)) ORDER BY d.defaclrole::regrole::text,coalesce(n.nspname,''),d.defaclobjtype) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE coalesce(n.nspname,'')<>'admin_console'),
    'policies',(SELECT jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) ORDER BY schemaname,tablename,policyname) FROM pg_policies WHERE schemaname<>'admin_console'));
END
$fingerprint$;
