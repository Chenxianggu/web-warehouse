-- CreateTable
CREATE TABLE "salesperson_menu_permissions" (
    "menu_key" VARCHAR(100) NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salesperson_menu_permissions_pkey" PRIMARY KEY ("menu_key")
);
