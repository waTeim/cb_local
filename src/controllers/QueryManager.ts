
import { ControllerBase, ControllerProperties, get, post, controller, Res } from 'ts-api';
import { Orderbook } from '../lib/Orderbook';

const BigNumber = require('bignumber.js');


interface OrderbookEntry
{
  price:number;
  size:number;
  numOrders:number;
};

interface OrderbookInterval
{
  aggregation:number;
  depth:number;
  date:Date;
  asks:OrderbookEntry[];
  bids:OrderbookEntry[];
};

/**
 * Query the orderbook
 */
@controller('/orderBook')
export default class QueryManager extends ControllerBase
{
  static book:Orderbook;

  constructor(properties:ControllerProperties)
  {
    super(properties);
  }

  @get('/interval') async getInterval(product:string,aggregation:number,depth:number):Promise<OrderbookInterval>
  {
    if(QueryManager.book == null) 
    {
      QueryManager.book = new Orderbook(this.properties.context.products);
      await QueryManager.book.init();
      console.log("book is synced");
    }

    let asks:OrderbookEntry[] = [];
    let bids:OrderbookEntry[] = [];
    let now = new Date();
    let state = QueryManager.book.state(product);
    let minAsk = state.asks[0].price;
    let maxBid = state.bids[0].price;
    let agg = BigNumber(aggregation);
    const midpointPrice = minAsk.plus(maxBid).dividedBy(2);
    const anchor = midpointPrice.dividedBy(agg).integerValue();
    let discriminators:any = [[],[]];

    for(let i = 0;i < depth;i++) 
    {
      discriminators[0].push(anchor.minus(i + 1).multipliedBy(agg));
      discriminators[1].push(anchor.plus(i).multipliedBy(agg));
    }

    let sizeSum = BigNumber(0);
    let priceSum = BigNumber(0);
    let numOrders = 0;
    let currentBucket = 0;
    let duplicateCheck:any = {};

    for(let bidIndex = 0;state.bids[bidIndex].price.gt(discriminators[0][depth - 1]);bidIndex++)
    {
      let id:string = state.bids[bidIndex].id;

      if(duplicateCheck[id] != null) continue;
      duplicateCheck[id] = true;

      let price = state.bids[bidIndex].price;
      let size = state.bids[bidIndex].size;

      if(price.lt(discriminators[0][currentBucket]))
      {
        let bucketPrice = priceSum.dividedBy(sizeSum);

         bids.push({ price:bucketPrice.toNumber(), size:sizeSum.toNumber(), numOrders:numOrders });
         sizeSum = BigNumber(0);
         priceSum = BigNumber(0);
         numOrders = 0;
         currentBucket++;
      }
      sizeSum = sizeSum.plus(size);
      priceSum = priceSum.plus(price.multipliedBy(size));
      numOrders++;
    }
    bids.push({ price:priceSum.dividedBy(sizeSum).toNumber(), size:sizeSum.toNumber(), numOrders:numOrders });

    sizeSum = BigNumber(0);
    priceSum = BigNumber(0);
    numOrders = 0;
    currentBucket = 0;
    duplicateCheck = {}

    for(let askIndex = 0;state.asks[askIndex].price.lt(discriminators[1][depth - 1]);askIndex++)
    {
      let id:string = state.asks[askIndex].id;

      if(duplicateCheck[id] != null) continue;
      duplicateCheck[id] = true;

      let price = state.asks[askIndex].price;
      let size = state.asks[askIndex].size;

      if(price.gt(discriminators[1][currentBucket]))
      {
        let bucketPrice = priceSum.dividedBy(sizeSum);

         asks.push({ price:bucketPrice.toNumber(), size:sizeSum.toNumber(), numOrders:numOrders });
         sizeSum = BigNumber(0);
         priceSum = BigNumber(0);
         numOrders = 0;
         currentBucket++;
      }
      sizeSum = sizeSum.plus(size);
      priceSum = priceSum.plus(price.multipliedBy(size));
      numOrders++;
    }
    asks.push({ price:priceSum.dividedBy(sizeSum).toNumber(), size:sizeSum.toNumber(), numOrders:numOrders });

    return { aggregation:aggregation, depth:depth, date:now, asks:asks, bids:bids };
  }
}