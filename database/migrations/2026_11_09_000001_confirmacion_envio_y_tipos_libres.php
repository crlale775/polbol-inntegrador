<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('documentos', function (Blueprint $table) {
            $table->string('tipo_libre', 100)->nullable();
            $table->string('tipo_libre_clave', 100)->nullable()->index();
            $table->jsonb('revision_previa')->nullable();
        });
        Schema::table('tipos_memo', fn (Blueprint $table) => $table->boolean('acceso_directo')->default(true));
        Schema::create('decisiones_tipos_libres', function (Blueprint $table) {
            $table->id();
            $table->string('clave', 100)->unique();
            $table->string('nombre', 100);
            $table->string('decision', 15);
            $table->unsignedInteger('id_tipo')->nullable();
            $table->unsignedInteger('decidido_por');
            $table->unsignedInteger('usos_al_decidir');
            $table->timestamp('decidido_en');
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('decisiones_tipos_libres');
        Schema::table('tipos_memo', fn (Blueprint $table) => $table->dropColumn('acceso_directo'));
        Schema::table('documentos', fn (Blueprint $table) => $table->dropColumn(['tipo_libre','tipo_libre_clave','revision_previa']));
    }
};
