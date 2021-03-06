import { Component, OnInit, OnDestroy, Input, ViewChild } from '@angular/core';


import { ApiService } from './shared/api.service';
import { SocketIoService } from './shared/socket-io.service';
import { Logger } from './shared/logger.service';
import {NgbDateStruct} from '@ng-bootstrap/ng-bootstrap';
import { Subscription }   from 'rxjs/Subscription';


@Component({
  selector: 'app-root',
  templateUrl: './app.view.html',
  styleUrls: ['./app.view.css']
})
export class AppComponent implements OnInit, OnDestroy {
  public stockSymbols: string[];
  private chartCollection = [];
  private companyCollection = [];
  private chartData;
  private numberOfMergers;
  private numberOfQueries;
  private numberOfAdditions = 0;
  public selectedDate;
  public errorMessage = { search: '', date: '', remove: '' }
  private subs: Subscription[] = [];
  private firstMessage = true;

  @ViewChild('fromDate') fromDateComponent;
  @ViewChild('toDate') toDateComponent;

  constructor(
    private _api  : ApiService,
    private _io   : SocketIoService,
    private _log  : Logger
  ){}

  ngOnInit(): void {
 this.subs[this.subs.length] = this._io.getMessages()
  .subscribe((message: any) => {
    let newSymbols = message.initialStocks.stocks;
    if(this.firstMessage){
      this.selectedDate = {from: '2016-01-11', to: '2017-01-10'}
      this.fromDateComponent.init('From', this.selectedDate.from);
      this.toDateComponent.init('To', this.selectedDate.to);
      this.stockSymbols = newSymbols;
      this.numberOfMergers = 0;
      this.stockSymbols.forEach(symbol => this.getStockHistory(symbol));
      this.getStockInfo(this.stockSymbols)
      this.firstMessage = false
    } else {
      if(!this.identicalArrays(this.stockSymbols, newSymbols)){
        console.log(this.stockSymbols, newSymbols)
        if(this.stockSymbols.length == newSymbols.length + 1){
          console.log('removed a stock')
          this.stockSymbols.forEach(symbol =>{
            for(let i=0; i<newSymbols.length; i++){
              if(symbol == newSymbols[i]) break;
              if(i == newSymbols.length - 1) this.removeStock(symbol, false);
            }
          })
        } else if(this.stockSymbols.length == newSymbols.length - 1) {
          console.log('added a stock')
          newSymbols.forEach(symbol =>{
            for(let i=0; i<this.stockSymbols.length; i++){
              if(symbol == this.stockSymbols[i]) break;
              if(i == this.stockSymbols.length - 1) this.addStock(symbol, false);
            }
          })
        } else {
          console.log('reseting app')
          this.stockSymbols = newSymbols;
          this.resetApp();
        }
      }
    }
  })

  }

   ngOnDestroy() {
    for(let sub of this.subs) sub.unsubscribe();
  }

    sendMessage(){
      this._io.sendMessage(this.stockSymbols);
    }

  getStockHistory(ticker){
    let queries = this._api.buildHistoryQuery(ticker, this.selectedDate.from, this.selectedDate.to);
    console.log('ngOnInit(): ', queries);
    this.numberOfQueries = queries.length; 
    queries.forEach(query =>{
      this._api.queryAPI(query)
        .subscribe(res => {
          console.log('ngOnInit(): retrieved ', res);
          let processedData = {id: ticker, values: []};
          for(let i=0; i<res.query.results.quote.length; i++)
            processedData.values[res.query.results.quote.length-i-1] = {date: res.query.results.quote[i].Date,
            close: Math.round(res.query.results.quote[i].Close * 10)/10};
          this.chartCollection.push(processedData);
          console.log('getStockHistory(): processed', this.chartCollection)
          this.updateChart();
        });
    });
  }

  getStockInfo(ticker){
    let query = this._api.buildQuoteQuery(ticker.join('","'));
    this.companyCollection = [];
    this._api.queryAPI(query)
      .subscribe(res => {
        //console.log('getStockInfo(ticker): ', res);
        if(Array.isArray(res.query.results.quote)){
          res.query.results.quote.forEach(quote => {
          this.companyCollection.push(
            this.extractCompanyInfo(ticker, quote));
          });
        } else { // Single item in resposne
          this.companyCollection.push(
            this.extractCompanyInfo(ticker, res.query.results.quote));
        }
        //console.log('done: ', this.companyCollection);
      });
  }

  extractCompanyInfo(ticker, quote){
    return {
      id: ticker,
      symbol: quote.Symbol,
      name: quote.Name,
      exchange: quote.StockExchange,
      marketcap: quote.MarketCapitalization,
      range: quote.YearRange,
      volume: quote.Volume
    }
  }

  updateChart(){
    //console.log('update charts')
    this.mergeCharts();
    //console.log('Adding to chart', this.chartCollection.length, this.stockSymbols.length, this.numberOfQueries, this.numberOfMergers)
    if(this.chartCollection.length == this.stockSymbols.length &&
      this.numberOfMergers == (this.stockSymbols.length * (this.numberOfQueries - 1)) ||
      this.numberOfAdditions && this.numberOfMergers == (this.numberOfQueries - 1)){
        //console.log('entered, adding...')
      this.chartData = [];
      this.chartCollection.forEach(chart => this.chartData.push(chart));
      this.numberOfAdditions = 0;
    }
  }

  mergeCharts(){
    if(this.chartCollection.length == this.stockSymbols.length * this.numberOfQueries
      || this.numberOfAdditions && (this.chartCollection.length == this.stockSymbols.length + this.numberOfQueries - 1 )){
      //console.log('Merge Charts: ')
      let ss = this.stockSymbols, nq = this.numberOfQueries,
          cc=this.chartCollection, n = cc.length;
      for(let k=0; k<( nq - 1 ); k++){
        //console.log('k=', k)
        for(let i=0; i<ss.length; i++){
          //console.log('i=', i)
          var max = -1;
          for(let j=0; j<n; j++){ // find largest
            if(ss[i] == cc[j].id){
              if(max == -1) max = j;
                if((new Date(cc[max].values[0].date)).getTime() >
                (new Date(cc[j].values[0].date)).getTime()) max = j;
            }
          }
          var newMax = max, max = -1;
          for(let j=0; j<n; j++){ // find second largest
            if(j != newMax){
              if(ss[i] == cc[j].id){
                if(max == -1) max = j;
                if((new Date(cc[max].values[0].date)).getTime() >
                (new Date(cc[j].values[0].date)).getTime()) max = j;
              }
            }
          }
          if(max != -1){
            cc[newMax].values = cc[newMax].values.concat(cc[max].values)
            cc.splice(max, 1);
            this.numberOfMergers++;
            n--;
          }
        }
      }
      //console.log('Merge Charts (done): ', this.chartCollection)
    }
  }

  removeStock(symbol, broadcast){
    if(this.stockSymbols.length > 1){
      let newStockSymbols = [] // Use javascript function to complete
      this.stockSymbols.forEach(stock => {
        if(stock != symbol) newStockSymbols.push(stock);
      });
      this.stockSymbols = newStockSymbols;
      this.getStockInfo(this.stockSymbols)
      let newChartCollection = [] // Use javascript function to complete
      this.chartCollection.forEach(chart =>{
        if(chart.id != symbol) newChartCollection.push(chart);
      });
      this.chartCollection = newChartCollection;
      this.numberOfMergers = (this.stockSymbols.length * (this.numberOfQueries - 1));
      this.updateChart();
      if(broadcast) this.sendMessage();
    } else {
      this.errorMessage.remove = 'Add another stock to remove ' + symbol;
    }
  }

  addStock(stock, broadcast){
    //console.log('addStock(): initial', this.stockSymbols)
    let ucStock = stock.toUpperCase()
    let query = this._api.buildQuoteQuery(ucStock);
    this._api.queryAPI(query)
      .subscribe(res => {
        if(res.query.results.quote.Name){
          console.log('success, adding')
          this.stockSymbols.push(ucStock)
          this.getStockInfo(this.stockSymbols)
          this.numberOfMergers = 0;
          this.numberOfAdditions++;
          this.getStockHistory(ucStock)
          if(broadcast) this.sendMessage();
        } else{
          console.log('trigger error')
          this.errorMessage.search = ucStock + ' was not found.'
        }
      });
  }

  resetApp(){
    this.selectedDate = {from: '2016-01-11', to: '2017-01-10'}
    this.fromDateComponent.init('From', this.selectedDate.from);
    this.toDateComponent.init('To', this.selectedDate.to);
    this.numberOfMergers = 0;
    this.stockSymbols.forEach(symbol => this.getStockHistory(symbol));
    this.getStockInfo(this.stockSymbols)
  }

  setDate(proposedDate, toOrFrom): void {
    console.log('setDate(): initial', this.stockSymbols)
    let newDate = new Date(proposedDate);
    if(toOrFrom == 'to'){
      if(newDate.getTime() - (new Date(this.selectedDate.from).getTime()) > 0) {
        this.selectedDate.to = proposedDate;
      } else {
        this.errorMessage.date = 'Dates must be sequential. ' + proposedDate + ' is not valid.'
        return;
      }
    } else {
      if((new Date(this.selectedDate.to).getTime()) - newDate.getTime() > 0) {
        this.selectedDate.from = proposedDate;
      } else {
        this.errorMessage.date = 'Dates must be sequential. ' + proposedDate + ' is not valid.'
        return;
      }
    }
    console.log('update plot')
    this.chartCollection = [];
    this.numberOfMergers = 0;
    this.stockSymbols.forEach(symbol => this.getStockHistory(symbol));
  }

  identicalArrays(ary1, ary2){
    if (ary1.length != ary2.length)
      return false;
    for (var i = 0, l=ary1.length; i < l; i++) {
      if (ary1[i] instanceof Array && ary2[i] instanceof Array) {
        if (!this.identicalArrays(ary1[i], ary2[i]))
          return false;
      } else if (ary1[i] != ary2[i]) { 
        return false;
      }
    }
    return true;
  }
}
