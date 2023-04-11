CREATE TABLE demo.postman (
        id bigserial NOT NULL,
        embedding vector NULL,
        "text" varchar(2000) NULL,
        "source" varchar(255) NULL,
        page int4 NULL,
        prompt bool NULL,
        hidden bool NULL,
        "date" timestamp NULL,
        CONSTRAINT pm_pkey PRIMARY KEY (id)
);
