begin;
delete from "UpsellRule" where "tenantId" = 'de681af3-c8d1-4c33-a351-8834984725d8';
delete from "Booking" where "tenantId" = 'de681af3-c8d1-4c33-a351-8834984725d8';
delete from "Service" where "tenantId" = 'de681af3-c8d1-4c33-a351-8834984725d8';
delete from "Staff" where "tenantId" = 'de681af3-c8d1-4c33-a351-8834984725d8';
delete from "Client" where "tenantId" = 'de681af3-c8d1-4c33-a351-8834984725d8';
commit;
select (select count(*) from "Service" where "tenantId"='de681af3-c8d1-4c33-a351-8834984725d8') as svc,
       (select count(*) from "Client" where "tenantId"='de681af3-c8d1-4c33-a351-8834984725d8') as cli;
