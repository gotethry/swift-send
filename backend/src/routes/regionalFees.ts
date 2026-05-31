import type { FastifyInstance } from 'fastify';

interface FeePreviewQuery {
  amount?: string;
  country?: string;
}

export default async function regionalFeeRoutes(fastify: FastifyInstance) {
  fastify.get('/fees/regions', async () => {
    const configs = fastify.container.services.regionalFee.getAllRegionConfigs();
    return configs.map((c) => ({
      region: c.region,
      regionName: c.regionName,
      baseFeePercent: c.baseFeePercent,
      minFee: c.minFee,
      maxFee: c.maxFee,
      description: c.description,
    }));
  });

  fastify.get<{ Querystring: FeePreviewQuery }>(
    '/fees/preview',
    async (req, reply) => {
      const amount = Number(req.query.amount);
      const country = (req.query.country || '').toUpperCase();

      if (!amount || amount <= 0) {
        return reply.code(400).send({ error: 'Valid amount is required' });
      }
      if (!country || country.length !== 2) {
        return reply.code(400).send({ error: 'Valid country code is required (e.g., MX)' });
      }

      return fastify.container.services.regionalFee.calculateFee(amount, country);
    },
  );

  fastify.get<{ Params: { countryCode: string }; Querystring: { amount?: string } }>(
    '/fees/country/:countryCode',
    async (req, reply) => {
      const countryCode = req.params.countryCode.toUpperCase();
      const amount = Number(req.query.amount) || 100;

      const region = fastify.container.services.regionalFee.getRegionForCountry(countryCode);
      const config = fastify.container.services.regionalFee.getFeeConfig(countryCode);
      const preview = fastify.container.services.regionalFee.calculateFee(amount, countryCode);

      return {
        countryCode,
        region,
        regionName: config.regionName,
        config: {
          baseFeePercent: config.baseFeePercent,
          minFee: config.minFee,
          maxFee: config.maxFee,
          description: config.description,
        },
        preview,
      };
    },
  );
}
