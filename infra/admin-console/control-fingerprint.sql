-- sg-control:session-v1
SET LOCAL search_path=pg_catalog;
SET LOCAL standard_conforming_strings=on;
SET LOCAL timezone='UTC';
SET LOCAL datestyle='ISO, YMD';
SET LOCAL intervalstyle='postgres';
SET LOCAL bytea_output='hex';
SET LOCAL extra_float_digits=3;
SET LOCAL row_security=off;
-- sg-control:fingerprint-v1
CREATE TEMP TABLE sg_cf_init(n integer) ON COMMIT DROP;
CREATE FUNCTION pg_temp.sg_control_state(protected_only boolean) RETURNS jsonb LANGUAGE plpgsql AS $state$
DECLARE item record; contents jsonb; metadata_state jsonb; rows_state jsonb := '[]'::jsonb;
BEGIN
  -- Reject unknown output types/settings before reading rows or role config.
  metadata_state := pg_temp.sg_control_metadata(protected_only);
  FOR item IN
    SELECT n.nspname,c.relname,c.relkind,c.oid
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      AND (NOT protected_only OR n.nspname<>'game_control')
      AND c.relkind IN ('r','S')
    ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"
  LOOP
    IF item.relkind='S' THEN
      EXECUTE format('SELECT jsonb_build_array(last_value,is_called) FROM %I.%I',item.nspname,item.relname) INTO contents;
      contents := contents || (SELECT jsonb_build_array(format_type(seqtypid,NULL),seqstart,seqincrement,seqmax,seqmin,seqcache,seqcycle)
        FROM pg_sequence WHERE seqrelid=item.oid);
    ELSE
      -- Composite text retains json whitespace and array bounds. No row values leave PG.
      EXECUTE format('SELECT jsonb_build_array(count(*),encode(sha256(convert_to(coalesce(string_agg(h,'''' ORDER BY h COLLATE "C"),''''),''UTF8'')),''hex''))
        FROM (SELECT encode(sha256(convert_to(t::text,''UTF8'')),''hex'') h FROM ONLY %I.%I t) hashes',item.nspname,item.relname) INTO contents;
    END IF;
    rows_state := rows_state || jsonb_build_array(jsonb_build_array(item.nspname,item.relname,contents));
  END LOOP;
  RETURN jsonb_build_object(
    'rows',rows_state,
    'metadata',metadata_state,
    'database',(SELECT jsonb_build_array(to_jsonb(d)-ARRAY['oid','datdba','datacl','dattablespace','datfrozenxid','datminmxid'],
      pg_get_userbyid(d.datdba),s.spcname,
      (SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
        ORDER BY pg_get_userbyid(a.grantor) COLLATE "C",(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type COLLATE "C",a.is_grantable),'[]'::jsonb)
       FROM aclexplode(nullif(coalesce(d.datacl,acldefault('d',d.datdba)),'{}'::aclitem[])) a),shobj_description(d.oid,'pg_database'))
      FROM pg_database d JOIN pg_tablespace s ON s.oid=d.dattablespace WHERE d.datname=current_database()),
    'roles',(SELECT coalesce(jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,
      rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig,shobj_description(oid,'pg_authid')) ORDER BY rolname COLLATE "C"),'[]'::jsonb) FROM pg_roles),
    'members',(SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option,inherit_option,set_option)
      ORDER BY pg_get_userbyid(roleid) COLLATE "C",pg_get_userbyid(member) COLLATE "C",pg_get_userbyid(grantor) COLLATE "C"),'[]'::jsonb) FROM pg_auth_members),
    'roleDatabaseSettings',(SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN s.setdatabase=0 THEN '*' ELSE d.datname END,
      CASE WHEN s.setrole=0 THEN '*' ELSE pg_get_userbyid(s.setrole) END,s.setconfig)
      ORDER BY coalesce(d.datname,'') COLLATE "C",pg_get_userbyid(s.setrole) COLLATE "C"),'[]'::jsonb)
      FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase));
END
$state$;
-- sg-control:contract-v1
WITH scope AS (
  SELECT n.* FROM pg_namespace n WHERE n.nspname = 'game_control'
), classes AS (
  SELECT c.*,n.nspname FROM pg_class c JOIN scope n ON n.oid=c.relnamespace
), routines AS (
  SELECT p.*,n.nspname FROM pg_proc p JOIN scope n ON n.oid=p.pronamespace
), types AS (
  SELECT t.*,n.nspname FROM pg_type t JOIN scope n ON n.oid=t.typnamespace
), acl_sources(kind,identity,acl) AS (
  SELECT 'schema',jsonb_build_array(nspname),coalesce(nspacl,acldefault('n',nspowner)) FROM scope
  UNION ALL SELECT 'relation',jsonb_build_array(nspname,relname),
    CASE WHEN relkind IN ('i','I') THEN coalesce(relacl,'{}'::aclitem[])
    ELSE coalesce(relacl,acldefault(CASE WHEN relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,relowner)) END FROM classes
  UNION ALL SELECT 'column',jsonb_build_array(c.nspname,c.relname,a.attname),coalesce(a.attacl,'{}'::aclitem[])
    FROM pg_attribute a JOIN classes c ON c.oid=a.attrelid WHERE a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT 'routine',jsonb_build_array(nspname,proname,pg_get_function_identity_arguments(oid)),coalesce(proacl,acldefault('f',proowner)) FROM routines
  UNION ALL SELECT 'type',jsonb_build_array(nspname,typname),coalesce(typacl,acldefault('T',typowner)) FROM types
  UNION ALL SELECT 'default',jsonb_build_array(pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype),d.defaclacl
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    WHERE d.defaclnamespace=0 OR d.defaclnamespace IN(SELECT oid FROM scope)
), acl_values AS (
  SELECT s.kind,s.identity,coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
    ORDER BY pg_get_userbyid(a.grantor) COLLATE "C",(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",
      a.privilege_type COLLATE "C",a.is_grantable) FILTER(WHERE a.grantor IS NOT NULL),'[]'::jsonb) AS acl
  FROM acl_sources s LEFT JOIN LATERAL aclexplode(nullif(s.acl,'{}'::aclitem[])) a ON true GROUP BY s.kind,s.identity
), entries(section,value) AS (
  SELECT 'schemas',jsonb_build_array(nspname,pg_get_userbyid(nspowner),obj_description(oid,'pg_namespace')) FROM scope
  UNION ALL SELECT 'acl',jsonb_build_array(kind,identity,acl) FROM acl_values
  UNION ALL SELECT 'relations',jsonb_build_array(c.nspname,c.relname,c.relkind,c.relpersistence,pg_get_userbyid(c.relowner),am.amname,
    c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions,s.spcname,c.relispartition,
    pg_get_expr(c.relpartbound,c.oid,false),CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END,
    CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,false) END)
    FROM classes c LEFT JOIN pg_am am ON am.oid=c.relam LEFT JOIN pg_tablespace s ON s.oid=c.reltablespace
  UNION ALL SELECT 'columns',jsonb_build_array(c.nspname,c.relname,row_number() OVER(PARTITION BY c.oid ORDER BY a.attnum),a.attname,
    format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attstorage,a.attcompression,a.attstattarget,a.attoptions,
    cn.nspname,coll.collname,pg_get_expr(d.adbin,d.adrelid,false))
    FROM pg_attribute a JOIN classes c ON c.oid=a.attrelid
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    LEFT JOIN pg_collation coll ON coll.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=coll.collnamespace
    WHERE a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT 'types',jsonb_build_array(t.nspname,t.typname,t.typtype,pg_get_userbyid(t.typowner),t.typlen,t.typbyval,t.typalign,t.typstorage,
    t.typcategory,t.typispreferred,t.typnotnull,t.typdefault,
    CASE WHEN t.typrelid<>0 THEN t.typrelid::regclass::text END,
    CASE WHEN t.typelem<>0 THEN format_type(t.typelem,NULL) END,
    CASE WHEN t.typarray<>0 THEN format_type(t.typarray,NULL) END,
    t.typinput::regprocedure::text,t.typoutput::regprocedure::text,t.typreceive::regprocedure::text,t.typsend::regprocedure::text,
    t.typmodin::regprocedure::text,t.typmodout::regprocedure::text,t.typanalyze::regprocedure::text,t.typsubscript::regprocedure::text)
    FROM types t
  UNION ALL SELECT 'constraints',jsonb_build_array(c.nspname,c.relname,x.conname,pg_get_constraintdef(x.oid,false),x.convalidated,
    x.condeferrable,x.condeferred,x.connoinherit,pn.nspname,pc.relname,parent.conname)
    FROM pg_constraint x JOIN classes c ON c.oid=x.conrelid LEFT JOIN pg_constraint parent ON parent.oid=x.conparentid
    LEFT JOIN pg_class pc ON pc.oid=parent.conrelid LEFT JOIN pg_namespace pn ON pn.oid=pc.relnamespace
  UNION ALL SELECT 'indexes',jsonb_build_array(c.nspname,c.relname,ic.relname,pg_get_indexdef(i.indexrelid,0,false),
    i.indisunique,i.indisprimary,i.indisexclusion,i.indisvalid,i.indisready,i.indislive,i.indisclustered,i.indisreplident,i.indnullsnotdistinct)
    FROM pg_index i JOIN classes c ON c.oid=i.indrelid JOIN pg_class ic ON ic.oid=i.indexrelid
  UNION ALL SELECT 'sequenceOwnership',jsonb_build_array(c.nspname,c.relname,d.deptype,n.nspname,target.relname,a.attname)
    FROM classes c JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.objsubid=0
      AND d.refclassid='pg_class'::regclass AND d.deptype IN('a','i')
    JOIN pg_class target ON target.oid=d.refobjid JOIN pg_namespace n ON n.oid=target.relnamespace
    JOIN pg_attribute a ON a.attrelid=target.oid AND a.attnum=d.refobjsubid
    WHERE c.relkind='S'
  UNION ALL SELECT 'inheritance',jsonb_build_array(cn.nspname,child.relname,pn.nspname,parent.relname,i.inhseqno,i.inhdetachpending)
    FROM pg_inherits i JOIN pg_class child ON child.oid=i.inhrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace
    JOIN pg_class parent ON parent.oid=i.inhparent JOIN pg_namespace pn ON pn.oid=parent.relnamespace
    WHERE child.relnamespace IN(SELECT oid FROM scope) OR parent.relnamespace IN(SELECT oid FROM scope)
  UNION ALL SELECT 'routines',jsonb_build_array(p.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),
    p.prokind,p.prosecdef,p.proleakproof,p.provolatile,p.proparallel,p.proconfig,
    CASE WHEN p.prokind<>'a' THEN pg_get_functiondef(p.oid) END) FROM routines p
  UNION ALL SELECT 'triggers',jsonb_build_array(c.nspname,c.relname,t.tgisinternal,
    CASE WHEN NOT t.tgisinternal THEN pg_get_triggerdef(t.oid,false) END,t.tgenabled,t.tgtype,t.tgfoid::regprocedure::text,
    t.tgdeferrable,t.tginitdeferred,x.conname,rn.nspname,rc.relname,encode(t.tgargs,'hex'),t.tgnargs,
    (SELECT jsonb_agg(a.attname ORDER BY k.ordinality) FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY k(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=k.attnum),pn.nspname,pc.relname,px.conname)
    FROM pg_trigger t JOIN classes c ON c.oid=t.tgrelid LEFT JOIN pg_constraint x ON x.oid=t.tgconstraint
    LEFT JOIN pg_class rc ON rc.oid=t.tgconstrrelid LEFT JOIN pg_namespace rn ON rn.oid=rc.relnamespace
    LEFT JOIN pg_trigger parent ON parent.oid=t.tgparentid LEFT JOIN pg_class pc ON pc.oid=parent.tgrelid
    LEFT JOIN pg_namespace pn ON pn.oid=pc.relnamespace LEFT JOIN pg_constraint px ON px.oid=parent.tgconstraint
  UNION ALL SELECT 'rules',jsonb_build_array(c.nspname,c.relname,r.rulename,r.ev_enabled,pg_get_ruledef(r.oid,false))
    FROM pg_rewrite r JOIN classes c ON c.oid=r.ev_class
  UNION ALL SELECT 'policies',jsonb_build_array(schemaname,tablename,policyname,permissive,cmd,
    (SELECT jsonb_agg(role_name ORDER BY role_name COLLATE "C") FROM unnest(roles) role_name),qual,with_check)
    FROM pg_policies WHERE schemaname IN(SELECT nspname FROM scope)
  UNION ALL SELECT 'comments',jsonb_build_array(o.type,o."schema",o.identity,d.description)
    FROM pg_description d CROSS JOIN LATERAL pg_identify_object(d.classoid,d.objoid,d.objsubid) o
    WHERE o."schema" IN(SELECT nspname FROM scope)
), sections(section) AS (
  VALUES('schemas'),('acl'),('relations'),('columns'),('types'),('constraints'),('indexes'),('sequenceOwnership'),('inheritance'),('routines'),('triggers'),('rules'),('policies'),('comments')
), metadata AS (
  SELECT jsonb_object_agg(s.section,coalesce((SELECT jsonb_agg(e.value ORDER BY e.value::text COLLATE "C") FROM entries e WHERE e.section=s.section),'[]'::jsonb)) value FROM sections s
), unsupported AS (
  SELECT
    EXISTS(SELECT FROM classes WHERE relkind NOT IN ('r','S','v','i') OR relpersistence<>'p' OR relispartition OR reltablespace<>0)
    OR EXISTS(SELECT FROM pg_attribute a JOIN classes c ON c.oid=a.attrelid WHERE a.attnum>0 AND a.attisdropped)
    OR EXISTS(SELECT FROM pg_inherits WHERE inhrelid IN(SELECT oid FROM classes) OR inhparent IN(SELECT oid FROM classes))
    OR EXISTS(SELECT FROM routines WHERE prokind='a')
    OR EXISTS(SELECT FROM types t WHERE NOT(
      (t.typtype='c' AND EXISTS(SELECT FROM classes c WHERE c.oid=t.typrelid AND c.relkind IN ('r','v')))
      OR (t.typtype='b' AND EXISTS(SELECT FROM types e JOIN classes c ON c.oid=e.typrelid WHERE e.oid=t.typelem AND e.typarray=t.oid AND e.typtype='c' AND c.relkind IN ('r','v')))))
    OR EXISTS(SELECT FROM pg_attribute a JOIN classes c ON c.oid=a.attrelid JOIN pg_type t ON t.oid=a.atttypid
      LEFT JOIN pg_type e ON e.oid=t.typelem AND e.typarray=t.oid JOIN pg_namespace n ON n.oid=coalesce(e.typnamespace,t.typnamespace)
      WHERE a.attnum>0 AND NOT a.attisdropped AND NOT(n.nspname='pg_catalog' AND coalesce(e.typname,t.typname)=ANY(ARRAY[
        'bool','int2','int4','int8','numeric','float4','float8','text','varchar','bpchar','name','bytea','uuid','json','jsonb',
        'date','time','timetz','timestamp','timestamptz','interval','bit','varbit','inet','cidr','macaddr','macaddr8','money','xml','tsvector','tsquery'])))
    OR EXISTS(SELECT FROM pg_trigger t JOIN classes c ON c.oid=t.tgrelid WHERE t.tgisinternal AND(t.tgconstraint=0 OR t.tgqual IS NOT NULL))
    OR EXISTS(SELECT FROM pg_default_acl)
    OR EXISTS(SELECT FROM pg_seclabel) OR EXISTS(SELECT FROM pg_shseclabel)
    OR EXISTS(SELECT FROM pg_db_role_setting s WHERE s.setdatabase<>0 OR s.setrole NOT IN(SELECT oid FROM pg_roles WHERE rolname IN('runtime_app','management_app'))
      OR EXISTS(SELECT FROM unnest(s.setconfig) config WHERE split_part(config,'=',1) NOT IN('search_path','statement_timeout','idle_in_transaction_session_timeout')))
    OR EXISTS(SELECT FROM pg_largeobject_metadata) OR EXISTS(SELECT FROM pg_event_trigger)
    OR EXISTS(SELECT FROM pg_publication) OR EXISTS(SELECT FROM pg_subscription) OR EXISTS(SELECT FROM pg_foreign_server)
    OR EXISTS(SELECT FROM pg_tablespace WHERE spcname NOT IN('pg_default','pg_global'))
    OR EXISTS(SELECT FROM pg_extension WHERE extname<>'plpgsql')
    OR EXISTS(SELECT FROM pg_language WHERE lanname NOT IN('internal','c','sql','plpgsql'))
    OR EXISTS(SELECT FROM pg_cast WHERE oid>=16384)
    OR EXISTS(SELECT FROM(
      SELECT collnamespace namespace FROM pg_collation UNION ALL SELECT connamespace FROM pg_conversion
      UNION ALL SELECT oprnamespace FROM pg_operator UNION ALL SELECT opcnamespace FROM pg_opclass UNION ALL SELECT opfnamespace FROM pg_opfamily
      UNION ALL SELECT cfgnamespace FROM pg_ts_config UNION ALL SELECT dictnamespace FROM pg_ts_dict
      UNION ALL SELECT prsnamespace FROM pg_ts_parser UNION ALL SELECT tmplnamespace FROM pg_ts_template UNION ALL SELECT stxnamespace FROM pg_statistic_ext
    ) objects WHERE namespace IN(SELECT oid FROM scope)) AS value
)
SELECT metadata.value AS metadata,
  (SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM game_control.schema_version) AS schema_versions,
  NOT unsupported.value AS supported
FROM metadata,unsupported;
