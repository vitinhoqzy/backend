const { MercadoPagoConfig, Preference } = require('mercadopago');

// SEU TOKEN
const client = new MercadoPagoConfig({ accessToken: 'TEST-4710905963435609-112421-569d0b4108c6e302fd32e2960c74f74a-487723253' });

const preference = new Preference(client);

console.log("⏳ Tentando criar preferência no Mercado Pago...");

preference.create({
    body: {
        items: [{
            id: '123',
            title: 'Produto Teste',
            quantity: 1,
            unit_price: 10.5,
            currency_id: 'BRL',
        }],
        // AQUI ESTÃO AS URLS QUE O MP EXIGE
        back_urls: {
            success: "http://localhost:5500/sucesso",
            failure: "http://localhost:5500/erro",
            pending: "http://localhost:5500/pendente"
        },
        auto_return: "approved",
    }
}).then((resposta) => {
    console.log("✅ SUCESSO! O Mercado Pago aceitou.");
    console.log("🔗 Link gerado: " + resposta.init_point);
}).catch((erro) => {
    console.log("❌ ERRO! O Mercado Pago recusou.");
    console.log(JSON.stringify(erro, null, 2));
});